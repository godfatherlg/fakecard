import { describe, expect, it } from 'vitest';
import { csvField } from '../src/maintenance';

describe('CSV fields', () => {
    it('leaves ordinary text alone', () => {
        expect(csvField('plain')).toBe('plain');
    });

    it('quotes commas, quotes and line breaks', () => {
        expect(csvField('a,b')).toBe('"a,b"');
        expect(csvField('a"b')).toBe('"a""b"');
        expect(csvField('a\nb')).toBe('"a\nb"');
    });

    it('disarms spreadsheet formulas', () => {
        expect(csvField('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
        expect(csvField('+1')).toBe("'+1");
        expect(csvField('-1')).toBe("'-1");
        expect(csvField('@cmd')).toBe("'@cmd");
    });
});
