import json
import logging
from bedrock_agentcore.tools.code_interpreter_client import CodeInterpreter
from strands import tool

logger = logging.getLogger(__name__)


class CodeInterpreterTools:
    """Tools for code execution via AgentCore Code Interpreter."""

    def __init__(self, region: str):
        self.region = region
        self._code_client = None

    def _get_client(self):
        """Get or create code interpreter client."""
        if self._code_client is None:
            self._code_client = CodeInterpreter(self.region)
            self._code_client.start()
            logger.info(f"Started code interpreter in {self.region}")
        return self._code_client

    def cleanup(self):
        """Clean up code interpreter session."""
        if self._code_client:
            self._code_client.stop()
            self._code_client = None

    @tool
    def execute_python(self, code: str, description: str = "") -> str:
        """
        Execute Python code in secure sandbox.

        Args:
            code: Python code to execute
            description: Optional description

        Returns:
            JSON string with execution result
        """
        if description:
            code = f"# {description}\n{code}"

        logger.debug(f"Executing: {description or 'code'}")

        client = self._get_client()
        response = client.invoke("executeCode", {
            "code": code,
            "language": "python",
            "clearContext": False
        })

        for event in response["stream"]:
            return json.dumps(event["result"], indent=2)
