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
    Entrypoint for Board Room AI.
    Business Advisor supervisor delegates to Marketing Director, CFO, CTO, and CISO subagents.
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

    # Add Agent/Task tool for subagent spawning
    # Note: claude-code CLI exposes the subagent tool as "Agent" (not "Task") in some versions
    allowed_tools.append("Task")
    allowed_tools.append("Agent")

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
            system_prompt="""You are the Business Advisor, the lead supervisor of Board Room AI — an AI-powered advisory team that helps entrepreneurs and business leaders evaluate ideas, build strategies, and launch ventures.

You are an experienced entrepreneur, strategist, and business advisor. You lead a core board of four specialists:
- marketing-director: Go-to-market, branding, customer acquisition, growth
- cfo: Financial modeling, fundraising, unit economics, pricing
- cto: AWS cloud architecture, MVP scoping, serverless stack selection, infrastructure roadmaps
- ciso: AWS security, IAM, compliance, data protection, threat modeling — coordinates with CTO on architecture security

You also have access to a bench of subject matter experts you can bring in when the core board identifies a gap:
- senior-web-developer: Full-stack web/mobile development, frontend frameworks, UX, API design
- ma-advisor: Fundraising, M&A, valuation, exit strategy, investor relations
- ip-attorney: Patents, trade secrets, IP protection, licensing, freedom-to-operate
- hr-talent: Team building, equity structure, hiring plan, comp strategy, culture
- healthcare-compliance: HIPAA, FDA digital health, clinical data, hospital procurement
- data-privacy: GDPR, CCPA, consumer PII, consent, data retention

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — SCOPING (first message from user)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When a user introduces a NEW business idea or challenge for the first time, DO NOT delegate to specialists yet.

Instead:
1. Open with a single sentence acknowledging the idea and your initial impression (enthusiastic, direct, human)
2. Ask exactly 4-5 targeted scoping questions to understand:
   - Stage/traction (pre-idea, MVP, launched, scaling?)
   - Target customer and market segment
   - Revenue model or monetization thinking
   - Team/founder background relevant to this
   - One specific area they most want help with (marketing, finance, or tech)

Keep this conversational — like you're sitting across the table from them in a first advisory meeting. Do NOT bullet-point the questions robotically. Weave them naturally.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — BRIEFING THE TEAM (after user answers)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Once the user has answered your scoping questions:
1. Write 2-3 sentences synthesizing what you now understand about their situation
2. Say something like "Let me bring in the team" or "I'm looping in my specialists now"
3. IMMEDIATELY delegate to ALL FOUR specialists using the Agent tool, including all context from the conversation
4. After all four respond, write a brief (3-4 sentence) closing synthesis — highlight the most important cross-functional insight and your single top recommendation as the advisor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3 — SME RECOMMENDATION (optional, after board responds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After the core board completes their analysis, review their responses. If ANY specialist explicitly defers to an outside domain OR if you identify a critical blind spot the core four cannot cover, you may recommend ONE subject matter expert from the bench.

RECOMMENDATION FORMAT — weave it naturally into your closing synthesis:
"One thing the board surfaced that I want to flag: [specific insight from a specialist] touches on [domain] — an area where dedicated expertise would sharpen our advice significantly. I'd like to bring in our [SME name] to weigh in on [specific aspect]. Want me to add them to the board?"

HANDLING THE USER'S RESPONSE:
- If the user says "yes", "sure", "go ahead", "bring them in", "add them", or any affirmative → immediately invoke the SME using the Agent tool with the full conversation context and a focused prompt for their domain
- If the user says "no", "skip", "not now", "we're good", or any negative → respond briefly: "Understood — we'll move forward without that for now. Let me know if you change your mind." Then continue the conversation normally
- If unclear, ask once: "Just to confirm — would you like me to bring in the [SME name]?"

RULES:
- Recommend at most ONE SME per session unless the user explicitly asks for another
- Only recommend if genuinely warranted — a board member flagged the gap OR the domain is clearly critical to the idea's success
- Never recommend an SME for a domain already covered by the core board
- The recommendation should feel like a natural advisor suggestion, not a menu option

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DELEGATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Always include the FULL conversation context in each Agent prompt (the user's original idea + their scoping answers)
- Frame each specialist's prompt for their domain
- For follow-ups on a specific domain, delegate only to that specialist
- For refinements to the overall idea, run all four again with updated context

CODE INTERPRETER:
For calculations, use mcp__codeint__execute_code. Pass "" for code_int_session_id on first call. Reuse the returned session ID for subsequent calls.

Your tone: warm, direct, confident. You're a trusted advisor who has seen hundreds of ventures — not a chatbot filling out a template.""",
        )

    async def _process_messages(options: ClaudeAgentOptions):
        """Run the agent and yield response events, including subagent attribution."""
        # Map tool_id -> agent_name to support parallel Task tool calls
        task_agent_map: dict[str, str] = {}

        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)
            async for msg in client.receive_response():
                logger.info("MSG TYPE: %s", type(msg).__name__)
                if isinstance(msg, SystemMessage):
                    if msg.subtype == "init":
                        logger.info("Claude session init: %s", msg.data.get("session_id"))
                elif isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, ToolUseBlock):
                            raw_id = getattr(block, "id", None)
                            tool_key = f"tool-{raw_id}" if raw_id else f"tool-{id(block)}"
                            logger.info("TOOL USE: %s (key=%s) input=%s", block.name, tool_key, json.dumps(block.input) if isinstance(block.input, dict) else str(block.input))

                            # Track Agent/Task tool calls by tool ID for parallel support
                            # claude-code CLI uses "Agent" tool name (not "Task") in some versions
                            if block.name in ("Task", "Agent") and isinstance(block.input, dict):
                                # Try common field names for the agent identifier
                                known_agents = set(subagents.keys())
                                agent_name = block.input.get("agent") or block.input.get("name")
                                # Fallback: scan all string values for a known agent key
                                if not agent_name or agent_name not in known_agents:
                                    for v in block.input.values():
                                        if isinstance(v, str) and v in known_agents:
                                            agent_name = v
                                            break
                                # Last resort: use first string value
                                if not agent_name:
                                    for v in block.input.values():
                                        if isinstance(v, str):
                                            agent_name = v
                                            break
                                task_agent_map[tool_key] = agent_name
                                logger.info("Registered subagent: %s -> %s", tool_key, agent_name)
                                yield {
                                    "subagent_start": {
                                        "agent": agent_name,
                                        "prompt": block.input.get("prompt", ""),
                                    }
                                }

                            yield {
                                "current_tool_use": {
                                    "name": block.name,
                                    "input": block.input,
                                    "toolUseId": tool_key,
                                }
                            }
                        elif isinstance(block, TextBlock):
                            logger.info("Agent response (len=%d)", len(block.text))
                            agent_responses.append(block.text)
                            yield {"data": block.text}
                elif isinstance(msg, UserMessage):
                    for block in msg.content:
                        logger.info("UserMessage block type: %s", type(block).__name__)
                        if isinstance(block, ToolResultBlock):
                            # Extract text content — handles str, list[dict], list[TextBlock]
                            raw_content = block.content
                            text_content = ""
                            if isinstance(raw_content, str):
                                text_content = raw_content
                            elif isinstance(raw_content, list) and len(raw_content) > 0:
                                first = raw_content[0]
                                if isinstance(first, dict):
                                    text_content = first.get("text", "")
                                elif isinstance(first, TextBlock):
                                    text_content = first.text
                                elif hasattr(first, "text"):
                                    text_content = first.text
                                elif isinstance(first, str):
                                    text_content = first

                            # Match result to agent by tool ID
                            raw_result_id = getattr(block, "tool_use_id", None)
                            result_key = f"tool-{raw_result_id}" if raw_result_id else None
                            agent_name = task_agent_map.get(result_key) if result_key else None

                            logger.info(
                                "ToolResultBlock: result_key=%s, agent=%s, content_type=%s, content_len=%d, map=%s",
                                result_key, agent_name, type(raw_content).__name__, len(text_content), list(task_agent_map.keys())
                            )

                            # Emit subagent_result for Task tool results
                            if agent_name and text_content:
                                yield {
                                    "subagent_result": {
                                        "agent": agent_name,
                                        "content": text_content,
                                    }
                                }
                                task_agent_map.pop(result_key, None)

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
