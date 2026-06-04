export const COMMON_MEDICINES = [
  // Antibiotics
  'Amoxicillin 500mg',
  'Amoxicillin 250mg',
  'Amoxicillin + Clavulanic Acid 625mg',
  'Amoxicillin + Clavulanic Acid 1g',
  'Metronidazole 400mg',
  'Metronidazole 200mg',
  'Doxycycline 100mg',
  'Clindamycin 300mg',
  'Ciprofloxacin 500mg',
  'Azithromycin 500mg',
  'Azithromycin 250mg',
  'Cephalexin 500mg',
  'Cefixime 200mg',
  'Cefuroxime 500mg',
  'Ceftriaxone Injection 1g',
  'Penicillin V 250mg',
  'Erythromycin 250mg',
  'Tetracycline 250mg',
  'Mouthwash - Chlorhexidine 0.2%',
  'Mouthwash - Chlorhexidine 0.12%',
  'Mouthwash - Povidone Iodine',

  // Painkillers / NSAIDs
  'Ibuprofen 400mg',
  'Ibuprofen 600mg',
  'Paracetamol 500mg',
  'Paracetamol 650mg',
  'Diclofenac 50mg',
  'Diclofenac 75mg Injection',
  'Naproxen 250mg',
  'Ketorolac 10mg',
  'Ketorolac Injection 30mg',
  'Mefenamic Acid 250mg',
  'Mefenamic Acid 500mg',
  'Combiflam (Ibuprofen + Paracetamol)',
  'Paracetamol + Diclofenac Combination',
  'Aceclofenac 100mg',
  'Lornoxicam 8mg',
  'Pregabalin 75mg',
  'Pregabalin 150mg',
  'Gabapentin 300mg',

  // Corticosteroids
  'Dexamethasone 4mg',
  'Dexamethasone 8mg Injection',
  'Betamethasone 0.5mg',
  'Prednisolone 10mg',
  'Prednisolone 20mg',
  'Triamcinolone Acetonide 40mg Injection',
  'Triamcinolone Ointment',

  // Anaesthetics
  'Lignocaine 2% Injection',
  'Lignocaine Gel 2%',
  'Lignocaine Spray 10%',
  'Lignocaine with Adrenaline 1:200000',
  'Articaine 4% Injection',
  'Bupivacaine 0.5% Injection',
  'Mepivacaine 3% Injection',

  // Antifungals
  'Fluconazole 150mg',
  'Fluconazole 200mg',
  'Itraconazole 100mg',
  'Clotrimazole Mouth Paint',
  'Clotrimazole Gel',
  'Miconazole Gel',
  'Nystatin Oral Suspension',
  'Amphotericin B Oral Suspension',

  // Antivirals
  'Acyclovir 200mg',
  'Acyclovir 400mg',
  'Acyclovir Cream 5%',
  'Valacyclovir 500mg',

  // Analgesics
  'Tramadol 50mg',
  'Tramadol 100mg Injection',
  'Codeine Phosphate 30mg',

  // Antacids / GI
  'Omeprazole 20mg',
  'Pantoprazole 40mg',
  'Ranitidine 150mg',
  'Ranitidine 50mg Injection',
  'Domperidone 10mg',
  'Ondansetron 4mg',
  'Ondansetron 8mg',
  'Metoclopramide 10mg',

  // Vitamins / Supplements
  'Calcium + Vitamin D3',
  'Vitamin B Complex',
  'Vitamin C 500mg',
  'Vitamin D3 60K',
  'Multivitamin Tablet',
  'Iron + Folic Acid',
  'Zinc 20mg',

  // Tranquilizers / Sedatives
  'Diazepam 5mg',
  'Diazepam 10mg Injection',
  'Midazolam 5mg Injection',
  'Alprazolam 0.25mg',
  'Lorazepam 2mg',
  'Nitrous Oxide',
  'Ketamine 50mg Injection',

  // Hemostatics
  'Tranexamic Acid 500mg',
  'Tranexamic Acid Injection 500mg',

  // Mouthwashes / Topical
  'Chlorhexidine Mouthwash 0.2%',
  'Chlorhexidine Mouthwash 0.12%',
  'Hydrogen Peroxide Mouthwash 1%',
  'Saline Mouthwash',
  'Metronidazole Gel',
  'Triamcinolone Oral Paste',
  'Choline Salicylate Gel (Bonjela)',
  'Lignocaine Gel 2%',
  'Benzocaine Gel 20%',

  // Other Dental
  'Sodium Fluoride Gel 1%',
  'Fluoride Varnish',
  'Desensitizing Paste',
  'Potassium Nitrate Gel 5%',
  'Sensodyne Toothpaste',
  'Tetracycline Ointment',
  'Zinc Oxide Eugenol Paste',
  'Calcium Hydroxide Paste',
  'Formocresol',
  'MTA (Mineral Trioxide Aggregate)',
].sort();

const DOSAGE_TOKEN = /^\d+[\.\d]*\s*(mg|g|mcg|ml|%|iu|k|units?)\s*(\w+)?$/i;
const DOSAGE_RATIO = /^\d+:\d+$/;

function isDosageToken(token) {
  const cleaned = token.replace(/[()]/g, '');
  return DOSAGE_TOKEN.test(cleaned) || DOSAGE_RATIO.test(cleaned);
}

export function parseMedicineName(fullName) {
  const trimmed = fullName.trim();
  const tokens = trimmed.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isDosageToken(tokens[i])) {
      return {
        name: tokens.slice(0, i).join(' '),
        dosage: tokens.slice(i).join(' '),
      };
    }
  }
  return { name: trimmed, dosage: '' };
}

// Unique salt names extracted from COMMON_MEDICINES
export const MEDICINE_SALTS = [...new Set(COMMON_MEDICINES.map(m => parseMedicineName(m).name))].sort();
