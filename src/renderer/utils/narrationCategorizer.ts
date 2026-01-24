import type { NarrationEvent, NarrationCategory, NarrationIcon } from '@shared/types';

interface NarrationCategorization {
  category: NarrationCategory;
  icon: NarrationIcon;
}

/**
 * Categorizes a narration event based on its text content and visibility.
 * Returns the appropriate category and icon for styling.
 */
export function categorizeNarration(event: NarrationEvent): NarrationCategorization {
  const text = event.textMarkdown;
  const visibility = event.visibility;

  // Check visibility-based private intel first
  if (visibility.kind === 'sheriff_private') {
    return { category: 'private_sheriff', icon: 'eye' };
  }
  if (visibility.kind === 'lookout_private') {
    return { category: 'private_lookout', icon: 'eye' };
  }
  if (visibility.kind === 'vigilante_private') {
    return { category: 'private_vigilante', icon: 'eye' };
  }
  if (visibility.kind === 'doctor_private') {
    return { category: 'private_doctor', icon: 'shield' };
  }

  // Critical events - check text patterns
  if (/wins!/i.test(text)) {
    return { category: 'critical_win', icon: 'trophy' };
  }
  if (/was found dead|eliminated|died from guilt|was killed/i.test(text)) {
    return { category: 'critical_death', icon: 'skull' };
  }
  if (/saved by the doctor|protected/i.test(text)) {
    return { category: 'critical_saved', icon: 'shield' };
  }
  if (/is the Mayor!|reveals? (as|they are) Mayor/i.test(text)) {
    return { category: 'critical_reveal', icon: 'crown' };
  }

  // Informational events
  // Note: Day/Night transitions now use TransitionEvent type, not Narration
  if (/No majority|could not agree|tie|no consensus/i.test(text)) {
    return { category: 'info_vote_outcome', icon: 'gavel' };
  }

  // Default to phase prompt
  return { category: 'info_phase_prompt', icon: 'clock' };
}

/**
 * Maps categories to their CSS class name suffix
 */
export function getCategoryClassName(category: NarrationCategory): string {
  const classMap: Record<NarrationCategory, string> = {
    critical_death: 'CriticalDeath',
    critical_win: 'CriticalWin',
    critical_saved: 'CriticalSaved',
    critical_reveal: 'CriticalReveal',
    info_transition: 'InfoTransition',
    info_phase_prompt: 'InfoPhasePrompt',
    info_vote_outcome: 'InfoVoteOutcome',
    private_sheriff: 'PrivateSheriff',
    private_lookout: 'PrivateLookout',
    private_vigilante: 'PrivateVigilante',
    private_doctor: 'PrivateDoctor',
  };
  return classMap[category];
}

/**
 * Returns the display label for private intel badges
 */
export function getPrivateBadgeLabel(category: NarrationCategory): string | null {
  if (category === 'private_sheriff') return 'Sheriff';
  if (category === 'private_lookout') return 'Lookout';
  if (category === 'private_vigilante') return 'Vigilante';
  if (category === 'private_doctor') return 'Doctor';
  return null;
}
