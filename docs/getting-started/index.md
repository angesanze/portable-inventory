# Getting Started

Follow these instructions to set up **Varasto** on your local machine.

## Prerequisites
*   Docker & Docker Compose
*   (Optional) Python 3.11+ & Node.js 18+ for local development without Docker.

## Quick Start (Docker)

The easiest way to run the system is via Docker Compose.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/my-org/portable-inventory.git
    cd portable-inventory
    ```

2.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # No changes needed for local testing
    ```

3.  **Start Services**:
    ```bash
    docker-compose up --build
    ```

4.  **Access the App** (the dev stack runs each service on its own port):
    *   **Frontend (SPA)**: [http://localhost:5173](http://localhost:5173)
    *   **Backend API**: [http://localhost:8001/api/v1/](http://localhost:8001/api/v1/) — host `8001` maps to the container's `8000` (host `8000` is left free to avoid the common Portainer conflict). In normal use the frontend proxies `/api` to the backend, so you browse the app at `:5173`.
    *   **Documentation**: [http://localhost:8002](http://localhost:8002)
    *   **Demo widget host**: [http://localhost:8081](http://localhost:8081)

---

## Manual Configuration (Backend)

If you need to configure the backend manually (e.g., for production):

1.  **Edit `.env`**:
    *   `SECRET_KEY`: Generate a secure random string.
    *   `DATABASE_URL`: Set your PostgreSQL connection string.
    *   `DEBUG`: Set to `0` for production.

2.  **Database Migrations**:
    ```bash
    docker-compose exec backend python manage.py migrate
    ```

3.  **Create Admin User**:
    ```bash
    docker-compose exec backend python manage.py createsuperuser
    ```
