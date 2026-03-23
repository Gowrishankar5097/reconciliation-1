# Backend Dockerfile for Ledger Reconciliation API
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for PDF processing and MySQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    default-libmysqlclient-dev \
    pkg-config \
    # For pdfplumber/PyMuPDF
    libmupdf-dev \
    mupdf-tools \
    # For tabula-py (Java required)
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt python-dotenv

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Run the application
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
