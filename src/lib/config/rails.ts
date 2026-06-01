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
    bank: {
        id: 'bank',
        name: 'Bank Transfer',
        description:
            'Generic bank transfer rail used by the SEP test anchor for end-to-end integration testing.',
        type: 'bank_transfer',
    },
    wirear: {
        id: 'wirear',
        name: 'CVU Transfer',
        description:
            "Argentine immediate bank transfer to a CVU (Clave Virtual Uniforme) — Koywe's WIREAR rail.",
        type: 'bank_transfer',
    },
    qri: {
        id: 'qri',
        name: 'QR Transfer',
        description:
            'QR-code based interbank transfer in Argentina, completed in the user’s banking app.',
        type: 'other',
    },
};

export function getPaymentRail(id: string): PaymentRail | undefined {
    return PAYMENT_RAILS[id];
}
