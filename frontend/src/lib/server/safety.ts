export function safetyResponse(text: string): { message: string; flag: string } | null {
  if (/ignore (?:all )?(?:previous|above|prior)|disregard.*(?:system|instructions)|you are now|jailbreak|pretend you are|override.*(?:safety|system)|bypass.*(?:rules|guardrail)|<\/?(?:system|caregiver_query)>|\[system\]|system\s*:|(?:other|all) (?:patients?|recipients?)|(?:show|reveal|print).*(?:secret|api key|system prompt)|(?:hurt|poison|harm|restrain) (?:him|her|dad|mum|mom|them)/i.test(text)) {
    return { message: "I can help explain recorded activities for the selected person. I cannot follow instructions to bypass safeguards, expose private information, or harm someone.", flag: "PROMPT_INJECTION_DEFLECTION" };
  }
  if (/\b(?:uti|urinary tract infection|alzheimer\w*|dementia|delirium|stroke|sepsis|pneumonia|depression|insomnia|sleep apnea|parkinson\w*|hypertension|heart attack|infection|covid|influenza|diagnos\w*|prescribe|dosage)\b|is (?:she|he|they) sick|what illness|medical condition|medication (?:side effect|reaction)|drug interaction|should i (?:give|administer)|treatment for|what pills/i.test(text)) {
    return { message: "I can summarize recorded behavioral observations, but I cannot provide diagnoses, medical causes, or treatment advice. Please consult a qualified healthcare professional about medical questions.", flag: "UNSUPPORTED_MEDICAL_REDIRECT" };
  }
  return null;
}
