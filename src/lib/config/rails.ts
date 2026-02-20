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
};

export function getPaymentRail(id: string): PaymentRail | undefined {
    return PAYMENT_RAILS[id];
}
