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
*   `GET /api/v1/product-models/`: List catalog items.
*   `GET /api/v1/stock/`: Get current stock levels (Calculated).
*   `POST /api/v1/movements/`: Create a stock movement (Transfer).

### Management
*   `GET /api/v1/locations/`: List physical and virtual locations.
*   `GET /api/v1/users/`: Manage company users.

## Rate Limiting
The API implements throttling to prevent abuse (rates defined in
`DEFAULT_THROTTLE_RATES`, `config/settings.py`):

*   **Login**: 10 attempts / minute.
*   **Public Widget**: 1,000 requests / hour, with a 100 / minute burst cap.
*   **Widget tiers**: the sustained rate scales with the API key's tier
    (`free` 1,000/hr · `standard` 10,000/hr · `premium` 100,000/hr).
*   **QR redirects**: 100 / minute. **QR API**: 500 / minute.
*   **Product import**: 30 / hour. **Company export**: 1 / hour.
*   **Authenticated (per user)**: 100,000 / day. **Anonymous**: 1,000 / day.
