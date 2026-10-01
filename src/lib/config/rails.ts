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
            'Account-to-account bank transfer; also the generic rail the SEP test anchor uses for end-to-end testing.',
        type: 'bank_transfer',
    },
    fast: {
        id: 'fast',
        name: 'FAST',
        description:
            "Fonların Anlık ve Sürekli Transferi — Türkiye's instant interbank transfer system, alongside the older EFT and same-bank Havale transfers.",
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
    cvu: {
        id: 'cvu',
        name: 'CVU / CBU / alias',
        description:
            'Argentine immediate bank transfer addressed by CVU, CBU, or alias — Manteca’s ARS rail.',
        type: 'bank_transfer',
    },
    breb: {
        id: 'breb',
        name: 'BRE-B',
        description:
            "Colombia's instant interbank payment system (Bre-B) for real-time COP transfers.",
        type: 'bank_transfer',
    },
    pse: {
        id: 'pse',
        name: 'PSE',
        description:
            "Pagos Seguros en Línea — Colombia's bank-debit rail for real-time COP transfers from a bank account.",
        type: 'bank_transfer',
    },
    'mobile-money': {
        id: 'mobile-money',
        name: 'Mobile Money',
        description:
            'Phone-number wallets run by telecom operators (MTN MoMo, Telecel Cash, AirtelTigo, Airtel Money); payments are approved with a PIN prompt.',
        type: 'mobile_money',
    },
    mpesa: {
        id: 'mpesa',
        name: 'M-Pesa',
        description:
            "Safaricom's mobile money wallet, Kenya's dominant payment rail; collections arrive as an STK push the payer approves with their PIN.",
        type: 'mobile_money',
    },
};

export function getPaymentRail(id: string): PaymentRail | undefined {
    return PAYMENT_RAILS[id];
}
