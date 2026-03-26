/**
 * Payment Rail Configuration
 *
 * Defines the payment rails (bank transfer systems) supported across regions.
 */

export interface PaymentRail {
    id: string;
    name: string;
    description: string;
    type: 'bank_transfer' | 'card' | 'mobile_money' | 'other';
}

export const PAYMENT_RAILS: Record<string, PaymentRail> = {
    spei: {
        id: 'spei',
        name: 'SPEI',
        description:
            "Sistema de Pagos Electrónicos Interbancarios - Mexico's real-time payment system",
        type: 'bank_transfer',
    },
    pix: {
        id: 'pix',
        name: 'PIX',
        description:
            "Brazil's instant payment system operated by the Central Bank, enabling 24/7 real-time transfers",
        type: 'bank_transfer',
    },
    cash_pickup: {
        id: 'cash_pickup',
        name: 'Cash Pickup',
        description:
            'Cash pickup at MoneyGram agent locations worldwide, or bank deposit in select countries',
        type: 'other',
    },
};

export function getPaymentRail(id: string): PaymentRail | undefined {
    return PAYMENT_RAILS[id];
}
