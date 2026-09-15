import asyncio
import importlib.metadata
import logging
import os
import signal
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    agent_name: str
    bot_name: str
    daily_room_url: str
    openai_base_url: str
    openai_model: str
    log_level: str


def load_settings() -> Settings:
    return Settings(
        agent_name=os.getenv("AGENT_NAME", "Paisa"),
        bot_name=os.getenv("PIPECAT_BOT_NAME", "paisa-voice-agent"),
        daily_room_url=os.getenv("DAILY_ROOM_URL", ""),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://smarthelio-agents-resource.openai.azure.com/openai/v1"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-realtime-2.1-mini"),
        log_level=os.getenv("PIPECAT_LOG_LEVEL", "info").upper(),
    )


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )


def get_pipecat_version() -> str:
    return importlib.metadata.version("pipecat-ai")


async def run() -> None:
    settings = load_settings()
    configure_logging(settings.log_level)

    version = get_pipecat_version()
    logging.info("Pipecat worker booting")
    logging.info("pipecat-ai version: %s", version)
    logging.info("Agent name: %s", settings.agent_name)
    logging.info("Bot name: %s", settings.bot_name)
    logging.info("OpenAI base URL: %s", settings.openai_base_url)
    logging.info("OpenAI model: %s", settings.openai_model)

    if not settings.daily_room_url:
        logging.warning("DAILY_ROOM_URL is empty. Set it when you are ready to join a Daily room.")

    if not os.getenv("OPENAI_API_KEY"):
        logging.warning("OPENAI_API_KEY is empty. Set it before enabling voice pipeline.")

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    logging.info("Pipecat worker is running in standby mode.")
    logging.info("This container is ready for Daily + OpenAI pipeline wiring.")

    await stop_event.wait()
    logging.info("Pipecat worker stopped")


if __name__ == "__main__":
    asyncio.run(run())
