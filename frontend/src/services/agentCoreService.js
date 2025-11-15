// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * AgentCore Service - Streaming Response Handler
 *
 * Handles streaming responses from AgentCore agents using Server-Sent Events (SSE).
 * Dynamically loads the appropriate parser based on the agent pattern in aws-exports.json.
 *
 * CUSTOMIZATION GUIDE
 * See strandsParser.js and langgraphParser.js for sample implementation of parsers for Strands and Langgraph.
 * Modify strandsParser.js or langgraphParser.js when You need to handle additional event types (e.g., tool calls, images). 
 * Create a new parser file to support other agent frameworks (not Strands or LangGraph), and replace the parser
 * with your agent's specific event parsing logic.
 */

import * as strandsParser from './strandsParser.js';
import * as langgraphParser from './langgraphParser.js';

// Parser selection based on agent pattern
let activeParser = null;

/**
 * Load and select the appropriate parser based on agent pattern
 */
const loadParser = async () => {
  if (activeParser) {
    return activeParser;
  }

  try {
    const response = await fetch("/aws-exports.json");
    const config = await response.json();
    const pattern = config.agentPattern || "strands-single-agent";

    // Select parser based on exact pattern match
    if (pattern === 'strands-single-agent') {
      activeParser = strandsParser;
      console.log(`Using Strands parser for pattern: ${pattern}`);
    } else if (pattern === 'langgraph-single-agent') {
      activeParser = langgraphParser;
      console.log(`Using LangGraph parser for pattern: ${pattern}`);
    } else {
      throw new Error(
        `Unsupported agent pattern: "${pattern}". ` +
        `Supported patterns: "strands-single-agent", "langgraph-single-agent". ` +
        `To add support for this pattern, create a parser file and update loadParser() in agentCoreService.js.`
      );
    }
    
    return activeParser;
  } catch (error) {
    console.error("Failed to load agent pattern:", error);
    // Default to Strands parser as fallback
    console.warn("Defaulting to Strands parser");
    activeParser = strandsParser;
    return activeParser;
  }
};

// Generate a UUID-like string that meets AgentCore requirements (min 33 chars)
const generateId = () => {
  const timestamp = Date.now().toString(36)
  
  // Use cryptographically secure random number generation
  const getSecureRandom = () => {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    return array[0].toString(36)
  }
  
  const random1 = getSecureRandom()
  const random2 = getSecureRandom()
  const random3 = getSecureRandom()
  return `${timestamp}-${random1}-${random2}-${random3}`
}

// Configuration - will be populated from aws-exports.json
const AGENT_CONFIG = {
  AGENT_RUNTIME_ARN: "",
  AWS_REGION: "us-east-1",
}

// Set configuration from environment or aws-exports
export const setAgentConfig = (runtimeArn, region = "us-east-1") => {
  AGENT_CONFIG.AGENT_RUNTIME_ARN = runtimeArn
  AGENT_CONFIG.AWS_REGION = region
}

/**
 * Invokes the AgentCore runtime with streaming support
 */
export const invokeAgentCore = async (query, sessionId, onStreamUpdate, accessToken, userId) => {
  try {
    if (!userId) {
      throw new Error("No valid user ID found in session. Please ensure you are authenticated.")
    }

    if (!accessToken) {
      throw new Error("No valid access token found. Please ensure you are authenticated.")
    }

    if (!AGENT_CONFIG.AGENT_RUNTIME_ARN) {
      throw new Error("Agent Runtime ARN not configured")
    }

    // Load the appropriate parser
    const parser = await loadParser();

    // Bedrock Agent Core endpoint
    const endpoint = `https://bedrock-agentcore.${AGENT_CONFIG.AWS_REGION}.amazonaws.com`

    // URL encode the agent ARN
    const escapedAgentArn = encodeURIComponent(AGENT_CONFIG.AGENT_RUNTIME_ARN)

    // Construct the URL
    const url = `${endpoint}/runtimes/${escapedAgentArn}/invocations?qualifier=DEFAULT`

    // Generate trace ID
    const traceId = `1-${Math.floor(Date.now() / 1000).toString(16)}-${generateId()}`

    // Set up headers
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "X-Amzn-Trace-Id": traceId,
      "Content-Type": "application/json",
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    }

    // Create the payload
    const payload = {
      prompt: query,
      runtimeSessionId: sessionId,
      userId: userId,
    }

    // Make HTTP request with streaming
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    let completion = '';
    let buffer = '';

    // Handle streaming response
    if (response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete lines (SSE format uses newlines as delimiters)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              // Use the dynamically loaded parser
              completion = parser.parseStreamingChunk(line, completion, onStreamUpdate);
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } else {
      // Fallback for non-streaming response
      completion = await response.text()
      onStreamUpdate(completion)
    }

    return completion
  } catch (error) {
    console.error("Error invoking AgentCore:", error)
    throw error
  }
}

/**
 * Generate a new session ID
 */
export const generateSessionId = () => {
  return generateId()
}
