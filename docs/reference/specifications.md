# Specifications

## Core Entities

### License
- **Purpose**: Defines the subscription plan and validity.
- **Fields**: `plan_type` (e.g., Basic, Enterprise), `valid_until`.
- **Automation**: Creating a License automatically triggers the creation of a Company, Admin User, and API Key.

### Company
- **Purpose**: Represents the tenant using the system.
- **Fields**: `name`, `settings` (JSON), link to `License`.

### User
- **Purpose**: Access control.
- **Fields**: Standard Django User fields + `role` (Admin, Worker), link to `Company`.

### ApiKey
- **Purpose**: external API access for devices/integrations.
- **Fields**: `key`, `label`, link to `Company`.

## Inventory Management

### ProductModel
- **Purpose**: The "blueprint" or catalog entry for a product (e.g., "iPhone 13 128GB").

### PhysicalProduct
- **Purpose**: A specific instance of a product (e.g., serial number `SN12345`).
- **Fields**: `serial_number`, `status` (In Stock, Deployed), link to `ProductModel`, link to `Location`.

### Location
- **Purpose**: Where items are stored (e.g., "Warehouse A", "Shelf 2").

### Movement
- **Purpose**: Tracks inventory history (Stock In, Stock Out, Transfer).

## API Endpoints

- `/api/v1/product_models/`: CRUD for product catalogs.
- `/api/v1/physical_products/`: Manage individual items.
- `/api/v1/locations/`: Manage storage locations.
- `/api/token/`: JWT Authentication.
