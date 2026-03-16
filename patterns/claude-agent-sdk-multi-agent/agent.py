# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from code_int_mcp.server import code_int_mcp_server
from claude_agent_sdk import (
    AssistantMessage,
    UserMessage,
    ResultMessage,
    SystemMessage,
    ClaudeAgentOptions,
    TextBlock,
    ToolUseBlock,
    ClaudeSDKClient,
    ToolResultBlock,
    ProcessError,
)
from bedrock_agentcore.runtime import BedrockAgentCoreApp, RequestContext
from agents.subagents import get_subagent_definitions
from utils.auth import extract_user_id_from_context, get_gateway_access_token
from utils.ssm import get_ssm_parameter
import logging
import json
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

# Maps runtimeSessionId -> claude_session_id for conversation resumption.
# Both are lost if the container restarts, so in-memory storage is sufficient.
_session_map: dict[str, str] = {}


@app.entrypoint
async def main(payload, context: RequestContext):
    """
    Entrypoint for the Startup Command Center.
    Business Advisor supervisor delegates to Marketing Director, CFO, and CTO subagents.
    """
    prompt = payload.get("prompt")
    runtime_session_id = payload.get("runtimeSessionId")

    if not all([prompt, runtime_session_id]):
        yield {
            "status": "error",
            "error": "Missing required fields: prompt or runtimeSessionId",
        }
        return

    code_int_session_id = payload.get("code_int_session_id", "")
    claude_session_id = _session_map.get(runtime_session_id)

    # Extract user ID securely from validated JWT token
    user_id = extract_user_id_from_context(context)
    logger.info("[AGENT] User: %s, Session: %s", user_id, runtime_session_id)

    # Get Gateway URL and access token
    stack_name = os.environ.get("STACK_NAME")
    gateway_url = None
    access_token = None
    if stack_name:
        # Validate stack name format to prevent SSM parameter path injection
        if not stack_name.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Invalid STACK_NAME format")
        try:
            gateway_url = get_ssm_parameter(f"/{stack_name}/gateway_url")
            access_token = get_gateway_access_token()
        except Exception as e:
            logger.warning("[AGENT] Gateway not available, continuing without tools: %s", e)
            gateway_url = None
            access_token = None

    agent_responses = []

    # Build MCP servers config
    mcp_servers = {
        "codeint": code_int_mcp_server,
    }
    allowed_tools = [
        "mcp__codeint__execute_code",
        "mcp__codeint__execute_command",
        "mcp__codeint__write_files",
        "mcp__codeint__read_files",
    ]

    # Add Gateway MCP server if available
    if gateway_url and access_token:
        mcp_servers["gateway"] = {
            "type": "http",
            "url": gateway_url,
            "headers": {"Authorization": f"Bearer {access_token}"},
        }
        allowed_tools.append("mcp__gateway__*")
        logger.info("Gateway MCP server configured: %s", gateway_url)

    # Add Task tool for subagent spawning
    allowed_tools.append("Task")

    # Build subagent definitions
    subagents = get_subagent_definitions(mcp_servers)

    def _build_options(resume_id: str | None) -> ClaudeAgentOptions:
        """Build ClaudeAgentOptions, optionally with a resume session ID."""
        return ClaudeAgentOptions(
            mcp_servers=mcp_servers,
            model="us.anthropic.claude-opus-4-6-v1",
            allowed_tools=allowed_tools,
            disallowed_tools=["Bash", "Write", "NotebookEdit", "Edit", "WebFetch", "Read", "Glob", "Grep", "EnterWorktree", "Skill", "TodoWrite", "CronCreate", "CronDelete", "CronList"],
            agents=subagents,
            resume=resume_id,
            thinking={"type": "adaptive"},
            cli_path="/usr/bin/claude",
            stderr=lambda line: logger.error("claude-code stderr: %s", line),
            system_prompt="""You are the Business Advisor, the lead supervisor of the Startup Command Center -- an AI-powered advisory team that helps entrepreneurs and business leaders evaluate ideas, build strategies, and launch ventures.

You are an experienced entrepreneur, strategist, and business advisor with deep knowledge across all business domains. You lead a team of three specialist agents:

SPECIALIST AGENTS (delegate via Task tool):
- marketing-director: Expert in go-to-market strategy, branding, customer acquisition, content marketing, growth hacking, and competitive positioning. Delegate marketing analysis here.
- cfo: Expert in financial modeling, fundraising, unit economics, revenue models, cash flow, and financial strategy. Delegate financial analysis here.
- cto: Expert in technical architecture, stack selection, MVP scoping, engineering roadmaps, and build-vs-buy decisions. Delegate technical analysis here.

YOUR WORKFLOW:
1. When a user describes a business idea, question, or task:
   a. First, provide a brief strategic overview (2-3 sentences) assessing the opportunity
   b. Then ALWAYS delegate to ALL THREE specialists using the Task tool -- send each one the full context of the user's request plus domain-specific framing
   c. After all specialists respond, provide a synthesized executive summary with your top 3-5 actionable recommendations

2. IMPORTANT DELEGATION RULES:
   - Always delegate to ALL THREE specialists for any business idea or strategy question
   - Include the full user request in each Task prompt so specialists have complete context
   - Frame the prompt for each specialist's domain (e.g., tell the CFO to focus on financials)
   - You may delegate to a single specialist only if the user explicitly asks about one domain

3. For follow-up questions:
   - If the user asks about a specific domain, delegate to the relevant specialist(s)
   - If the user refines their idea, delegate to all three again with the updated context

CODE INTERPRETER SESSION:
If you need to run calculations or data analysis, use mcp__codeint__execute_code.
For the first call, pass an empty string "" for code_int_session_id. Use the returned session ID for subsequent calls. NEVER fabricate session IDs.

Your tone should be confident, strategic, and executive-level. Think like a seasoned startup advisor who has seen hundreds of ventures.""",
        )

    async def _process_messages(options: ClaudeAgentOptions):
        """Run the agent and yield response events, including subagent attribution."""
        # Track Task tool invocations to attribute subagent results
        current_task_agent = None
        current_task_tool_id = None

        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)
            async for msg in client.receive_response():
                if isinstance(msg, SystemMessage):
                    if msg.subtype == "init":
                        logger.info("Claude session init: %s", msg.data.get("session_id"))
                elif isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, ToolUseBlock):
                            logger.info("TOOL USE: %s", block.name)

                            # Track Task tool calls for subagent attribution
                            if block.name == "Task" and isinstance(block.input, dict):
                                current_task_agent = block.input.get("agent")
                                current_task_tool_id = f"tool-{block.id}" if hasattr(block, "id") else f"tool-{hash(block.name)}"
                                # Emit subagent_start event for frontend routing
                                yield {
                                    "subagent_start": {
                                        "agent": current_task_agent,
                                        "prompt": block.input.get("prompt", ""),
                                    }
                                }

                            yield {
                                "current_tool_use": {
                                    "name": block.name,
                                    "input": block.input,
                                    "toolUseId": f"tool-{block.id}" if hasattr(block, "id") else f"tool-{hash(block.name)}",
                                }
                            }
                        elif isinstance(block, TextBlock):
                            logger.info("Agent response: %s", block.text)
                            agent_responses.append(block.text)
                            yield {"data": block.text}
                elif isinstance(msg, UserMessage):
                    for block in msg.content:
                        if isinstance(block, ToolResultBlock):
                            if block.content and len(block.content) > 0:
                                text_content = ""
                                if isinstance(block.content[0], dict):
                                    text_content = block.content[0].get("text", "")

                                # Emit subagent_result for Task tool results
                                if current_task_agent and text_content:
                                    yield {
                                        "subagent_result": {
                                            "agent": current_task_agent,
                                            "content": text_content,
                                        }
                                    }
                                    current_task_agent = None
                                    current_task_tool_id = None

                                try:
                                    result_data = json.loads(text_content)
                                    if isinstance(result_data, dict):
                                        extracted = result_data.get("code_int_session_id", "")
                                        if extracted:
                                            code_int_session_id = extracted
                                except json.JSONDecodeError:
                                    pass
                elif isinstance(msg, ResultMessage):
                    logger.info("ResultMessage received, session_id=%s", msg.session_id)
                    if msg.session_id:
                        _session_map[runtime_session_id] = msg.session_id
                    yield {"claude_session_id": msg.session_id}

    try:
        async for event in _process_messages(_build_options(claude_session_id)):
            yield event
    except ProcessError:
        if claude_session_id:
            logger.warning("Resume failed for session %s, starting fresh session", claude_session_id)
            async for event in _process_messages(_build_options(None)):
                yield event
        else:
            raise


if __name__ == "__main__":
    app.run()
