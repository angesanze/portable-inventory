/**
 * Inventory Domain Types
 */

import type {
    ProductModel as ApiProductModel,
    Location as ApiLocation,
    PhysicalProduct as ApiPhysicalProduct,
    Movement as ApiMovement
} from './api';

// Re-export basic types
export type {
    LocationType,
    TrackingMode,
    EngineType,
    InventoryProfile,
} from './api';

export { PROFILE_METADATA } from './api';
export type { ProfileMetadata } from './api';

// Extended Interfaces for Frontend (if needed) or simple re-exports.
// Plain aliases for now — frontend-specific computed fields can switch these
// back to `interface ... extends` when there's something to add.
export type Location = ApiLocation;

export type ProductModel = ApiProductModel;

export interface PhysicalProduct extends ApiPhysicalProduct {
    // API responses often flatten related fields or include extra derived data
    product_model_name?: string;
    location_name?: string;
}

export interface Movement extends ApiMovement {
    product_model_name?: string;
    from_location_name?: string;
    to_location_name?: string;
    user_name?: string;
}

// Utility type for Refine list responses
export interface PaginatedList<T> {
    data: T[];
    total: number;
}
