/**
 * Sandbox test data for KYC submissions.
 *
 * Pre-filled personal info and placeholder document URLs for sandbox/demo
 * environments. Portable — anyone copying the `anchors/` directory gets
 * sandbox data for free.
 */

/** Pre-filled personal info for sandbox/demo KYC submissions (Mexico). */
export const SANDBOX_KYC_DATA: Record<string, string> = {
    // Etherfuse / Mexico
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

    // PDAX / Philippines — sender + beneficiary identity is the same individual for self-onramp
    sender_first_name: 'Juan',
    sender_middle_name: 'Cruz',
    sender_last_name: 'Reyes',
    sender_country_origin: 'Philippines',
    sender_address_line_one: '123 Ayala Avenue',
    sender_address_line_two: '',
    sender_city: 'Makati',
    sender_province: 'Metro Manila',
    sender_country: 'Philippines',
    sender_zip_code: '1226',
    sender_phone_number: '639171234567',
    sender_nationality: 'Philippines',
    sender_national_identity_number: '111122223333',
    sender_dob: '06-15-1990',
    sender_place_of_birth: 'Manila',
    source_of_funds: 'Compensation',
    sender_email: '', // filled at runtime
    beneficiary_first_name: 'Juan',
    beneficiary_middle_name: 'Cruz',
    beneficiary_last_name: 'Reyes',
    beneficiary_sex: 'Male',
    beneficiary_nationality: 'Philippines',
    beneficiary_dob: '06-15-1990',
    beneficiary_address_line_one: '123 Ayala Avenue',
    beneficiary_address_line_two: '',
    beneficiary_barangay: 'Bel-Air',
    beneficiary_city: 'Makati',
    beneficiary_province: 'Metro Manila',
    beneficiary_country: 'Philippines',
    beneficiary_zip_code: '1226',
    beneficiary_phone_number: '639171234567',
    purpose: 'Investments/Savings',
    relationship_of_sender_to_beneficiary: 'Myself',
    nature_of_business: '',
    instructions: '',
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

/** Pre-filled SPEI bank account fields for sandbox/demo off-ramps (Mexico). */
export const SANDBOX_SPEI_ACCOUNT = {
    bankName: 'BBVA',
    clabe: '012180001234567890',
    beneficiary: 'María García',
};

/** Sample PIX key for each supported PIX key type. `random` returns a fresh UUID on every access. */
export const SANDBOX_PIX_KEYS: Record<string, string> = {
    cpf: '12345678901',
    cnpj: '12345678000199',
    email: 'joao.silva@example.com',
    phone: '+5511912345678',
    get random() {
        return crypto.randomUUID();
    },
};

/** Pre-filled PIX bank account fields for sandbox/demo off-ramps (Brazil). */
export const SANDBOX_PIX_ACCOUNT = {
    pixKey: SANDBOX_PIX_KEYS.cpf,
    pixKeyType: 'cpf',
    taxId: '12345678901',
    accountHolderName: 'João Silva',
};
