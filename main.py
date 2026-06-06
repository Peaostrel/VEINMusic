import uvicorn
import os
from dotenv import load_dotenv

load_dotenv()

# The monolithic file has been refactored into the `app` package.
# Run this file to start the server.

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    uvicorn.run("app.main:app", host=host, port=port, reload=os.getenv("ENVIRONMENT") == "development")
