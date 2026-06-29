from openai import OpenAI
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

client = OpenAI(
    api_key=os.environ["VAYNE_LLM_API_KEY"]
)

response = client.responses.create(
    model=os.environ["VAYNE_LLM_MODEL"],
    input="Say hello from VAYNE."
)

print(response.output_text)
