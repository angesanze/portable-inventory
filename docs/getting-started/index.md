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

4.  **Access the App**:
    *   **Frontend**: [http://localhost](http://localhost)
    *   **Backend API**: [http://localhost/api/v1/](http://localhost/api/v1/)
    *   **Documentation**: [http://localhost/docs/](http://localhost/docs/)

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
