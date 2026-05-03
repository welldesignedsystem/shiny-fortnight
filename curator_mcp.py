"""Launcher for the Curator FastMCP server."""

from src.curator.server import mcp


if __name__ == "__main__":
    mcp.run(transport="http")
