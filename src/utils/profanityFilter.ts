// ── Prohibited words list ─────────────────────────────────────────────
// Categories: brand protection, profanity, slurs, violence, sexual,
// drugs, leetspeak variants, scam/spam indicators.
// Normalization (below) handles most obfuscation, so explicit leetspeak
// entries are only needed when normalization alone can't catch them.

const PROHIBITED_WORDS: string[] = [
  // Brand protection
  'noomi', 'noomibodi', 'noomybody', 'nuumi', 'numibodi',
  'admin', 'administrator', 'official', 'support', 'help',
  'mod', 'moderator', 'staff', 'team', 'bot', 'system',

  // Major profanity
  'fuck', 'fucker', 'fucking', 'fuk', 'fck', 'fvck', 'phuck',
  'shit', 'crap', 'piss', 'damn', 'hell', 'ass', 'arse',
  'asshole', 'bastard', 'bitch', 'bitches', 'cock', 'cunt',
  'dick', 'pussy', 'pussies', 'penis', 'vagina', 'whore',
  'slut', 'sluts', 'tits', 'boobs', 'sex', 'porn', 'nude',
  'nudes', 'naked', 'horny', 'rape', 'molest',

  // Racial slurs
  'nigger', 'nigga', 'negro', 'coon', 'spook', 'chink', 'gook',
  'spic', 'wetback', 'beaner', 'kike', 'hymie', 'towelhead',
  'sandnigger', 'raghead', 'paki', 'dothead', 'redskin', 'injun',
  'polack', 'kraut', 'jap', 'nip', 'wop',

  // Homophobic / transphobic slurs
  'faggot', 'fag', 'dyke', 'queer', 'tranny', 'shemale', 'heshe',

  // Ableist slurs
  'retard', 'retarded', 'tard', 'autist', 'autistic',
  'spaz', 'cripple', 'midget', 'mongoloid',

  // Violence / harmful
  'kill', 'murder', 'suicide', 'kys', 'die', 'death',
  'nazi', 'hitler', 'terrorist',

  // Sexual / inappropriate
  'anal', 'blowjob', 'handjob', 'orgasm', 'cumshot', 'bukkake',
  'gangbang', 'milf', 'dildo', 'vibrator', 'masturbate', 'jerkoff',

  // Drugs
  'cocaine', 'heroin', 'meth', 'crack', 'weed', 'marijuana',
  'cannabis', 'ecstasy',

  // Leetspeak variants (only those normalization can't derive)
  'sh1t', 'b1tch', 'a55', 'a55hole', 'n00mi', 'no0mi', 'n0omi',
  'b!tch', 'd1ck', 'pu55y',
  'fuсk',  // Cyrillic с
  'shіt',  // Cyrillic і

  // Scam / spam indicators
  'verify', 'verified', 'bitcoin', 'crypto', 'investment', 'profit',
  'earnings', 'cashapp', 'venmo', 'paypal', 'telegram', 'whatsapp',
];

// ── Normalization ─────────────────────────────────────────────────────
// Maps common visual lookalikes and leetspeak to a canonical form so
// "fvck", "fück", "f_u_c_k", and "fuсk" (Cyrillic с) all collapse to
// the same string as "fuck".

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0оО]/g, 'o')
    .replace(/[1!ІіLĺľ]/g, 'i')
    .replace(/[3еЕ]/g, 'e')
    .replace(/[4@аА]/g, 'a')
    .replace(/[5$ѕЅ]/g, 's')
    .replace(/[7тТ]/g, 't')
    .replace(/[8вВ]/g, 'b')
    .replace(/[9ԍ]/g, 'g')
    .replace(/[сС]/g, 'c')        // Cyrillic с/С → Latin c
    .replace(/[рР]/g, 'p')        // Cyrillic р/Р → Latin p
    .replace(/[хХ]/g, 'x')        // Cyrillic х/Х → Latin x
    .replace(/[уУ]/g, 'y')        // Cyrillic у/У → Latin y
    .replace(/[_\-.*]/g, '')       // strip separators used to break up words
    .replace(/\s+/g, '')           // collapse spaces
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip diacritics (fück → fuck)
}

// Pre-normalize the word list so both sides of every comparison use the
// same canonical form. Deduplicates automatically via Set.
const NORMALIZED_SET = new Set(PROHIBITED_WORDS.map(normalize));
const NORMALIZED_LIST = [...NORMALIZED_SET];

// ── Core check ────────────────────────────────────────────────────────

export function containsProhibitedWord(text: string): boolean {
  if (!text) return false;
  const n = normalize(text);
  if (NORMALIZED_SET.has(n)) return true;
  return NORMALIZED_LIST.some(word => n.includes(word));
}

// ── Field-level validators ────────────────────────────────────────────

export function validateDisplayName(displayName: string, skipProfanity = false): string | null {
  if (!displayName) return null;
  if (displayName.length > 50) return 'Display name must be under 50 characters';
  if (!skipProfanity && containsProhibitedWord(displayName)) return 'This display name is not allowed';
  return null;
}

export function validateBio(bio: string, skipProfanity = false): string | null {
  if (!bio) return null;
  if (bio.length > 150) return 'Bio must be under 150 characters';
  if (!skipProfanity && containsProhibitedWord(bio)) return 'Please keep your bio appropriate';
  return null;
}
