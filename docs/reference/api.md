# API Reference

The backend exposes a RESTful API built with **Django REST Framework (DRF)**.

## Authentication

### 1. JWT (User Auth)
Used by the Frontend (Refine) for logged-in users.
*   **Header**: `Authorization: Bearer <access_token>`
*   **Endpoints**:
    *   `POST /api/token/`: Obtain pair.
    *   `POST /api/token/refresh/`: Refresh access token.

### 2. API Keys (Machine/Widget Auth)
Used by external scripts or public widgets.
*   **Query Param**: `?api_key=...`
*   **Header**: `X-API-KEY: ...` (Supported on some endpoints)

## Core Endpoints

### Inventory
*   `GET /api/v1/product_models/`: List catalog items.
*   `GET /api/v1/stock/`: Get current stock levels (Calculated).
*   `POST /api/v1/movements/`: Create a stock movement (Transfer).

### Management
*   `GET /api/v1/locations/`: List physical and virtual locations.
*   `GET /api/v1/users/`: Manage company users.

## Rate Limiting
The API implements throttling to prevent abuse:
*   **Login**: 5 attempts / minute.
*   **Public Widget**: 100 requests / hour.
*   **QR Redirects**: 20 scans / minute.
