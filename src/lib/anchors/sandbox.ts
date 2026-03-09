/**
 * Sandbox test data for KYC submissions.
 *
 * Pre-filled personal info and placeholder document URLs for sandbox/demo
 * environments. Portable — anyone copying the `anchors/` directory gets
 * sandbox data for free.
 */

/** Pre-filled personal info for sandbox/demo KYC submissions (Mexico). */
export const SANDBOX_KYC_DATA: Record<string, string> = {
    firstName: 'María',
    lastName: 'García',
    dateOfBirth: '1990-06-15',
    taxId: 'GARM900615MDFRRL09',
    phoneNumber: '+525512345678',
    address: 'Av. Paseo de la Reforma 222',
    city: 'Ciudad de México',
    state: 'CDMX',
    postalCode: '06600',
    country: 'MX',
    dni: 'GARM900615MDFRRL09',
    email: '', // filled at runtime from component prop
};

/** Placeholder document URLs for sandbox KYC (used by url_reference mode). */
export const SANDBOX_KYC_DOCUMENTS: Record<string, string> = {
    idFront:
        'https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/1000_F_365165797_VwQbNaD4yjWwQ6y1ENKh1xS0TXauOQvj.jpg',
    idBack: 'https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/1000_F_365165797_VwQbNaD4yjWwQ6y1ENKh1xS0TXauOQvj.jpg',
    selfie: 'https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/selfie.png',
    proofOfAddress:
        'https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/1000_F_365165797_VwQbNaD4yjWwQ6y1ENKh1xS0TXauOQvj.jpg',
};
