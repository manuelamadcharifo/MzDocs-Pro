export const Validator = {
  phone(raw) {
    const clean = raw.replace(/\D/g, '');
    return /^8[4-7]\d{7}$/.test(clean) || /^2588[4-7]\d{7}$/.test(clean);
  },

  amount(val, validAmounts = [150, 350, 750]) {
    return validAmounts.includes(parseInt(val, 10));
  },

  required(fields, data) {
    for (const f of fields) {
      if (f.row) {
        for (const fi of f.items) {
          if (fi.required && !data[fi.id]?.trim()) return fi.label;
        }
      } else if (f.required && !data[f.id]?.trim()) {
        return f.label;
      }
    }
    return null;
  }
};