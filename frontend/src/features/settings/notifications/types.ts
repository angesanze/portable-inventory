export type ChannelKind = "EMAIL" | "WEBHOOK";

export interface NotificationChannel {
    id: string;
    name: string;
    kind: ChannelKind;
    is_active: boolean;
    recipients: string;
    url: string;
    secret: string;
    headers: Record<string, string>;
    event_filter: string[];
    created_at: string;
    updated_at: string;
}

export interface NotificationDelivery {
    id: string;
    channel: string;
    channel_name: string;
    channel_kind: ChannelKind;
    event_log: string;
    event_message: string;
    product_name: string;
    status: "PENDING" | "SENT" | "FAILED";
    attempts: number;
    last_error: string;
    next_retry_at: string | null;
    created_at: string;
}
