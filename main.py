import uvicorn
import os
from dotenv import load_dotenv

load_dotenv()

# The monolithic file has been refactored into the `app` package.
# Run this file to start the server.

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=os.getenv("ENVIRONMENT") == "development")
