import json
from collections.abc import AsyncIterator

import httpx

from app.config import settings
from app.services.providers.base import ProviderAdapter, ProviderError


class OpenAIProvider(ProviderAdapter):
    name = "openai"
    _url = "https://api.openai.com/v1/chat/completions"
    _model = "gpt-4o-mini"

    def __init__(self, api_key: str):
        self._api_key = api_key

    async def complete(self, prompt: str) -> AsyncIterator[str]:
        headers = {"Authorization": f"Bearer {self._api_key}"}
        payload = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
                async with client.stream("POST", self._url, headers=headers, json=payload) as resp:
                    if resp.status_code >= 400:
                        raise ProviderError(f"openai returned {resp.status_code}")
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line.removeprefix("data: ").strip()
                        if data == "[DONE]":
                            break
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content")
                        if delta:
                            yield delta
        except httpx.TimeoutException as e:
            raise ProviderError("openai request timed out") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"openai transport error: {e}") from e

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                return resp.status_code == 200
        except httpx.HTTPError:
            return False
