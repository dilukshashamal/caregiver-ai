import { isFollowUp } from "./intent";
import { explainConcept } from "./concepts";

export function safetyResponse(text: string, hasPreviousContext = false): { message: string; flag: string } | null {
  const trimmed = text.trim();

  // 1. Acute Medical Emergency & Life-Safety Guardrail
  if (/\b(?:call\s+(?:911|emergency|ambulance)|emergency|collapsed|unresponsive|unconscious|not\s+breathing|stopped\s+breathing|chest\s+pain|choking|severe\s+bleeding|profuse\s+bleeding|fallen\s+and\s+can'?t\s+get\s+up|head\s+trauma|seizure)\b/i.test(trimmed)) {
    return {
      message: "If this is a medical emergency or someone has fallen, collapsed, or is in immediate danger, please call 911 or your local emergency services immediately. I am an AI assistant for recorded routine activities and cannot dispatch emergency services or provide emergency medical care.",
      flag: "EMERGENCY_REDIRECT"
    };
  }

  // 2. Self-Harm & Crisis Guardrail
  if (/\b(?:suicide|kill\s+(?:myself|himself|herself|themselves)|want\s+to\s+die|end\s+(?:my|his|her|their)\s+life|self-?harm)\b/i.test(trimmed)) {
    return {
      message: "If you or someone you know is in crisis or considering self-harm, please call or text 988 immediately to reach the Suicide & Crisis Lifeline (free, confidential, 24/7), or contact your local emergency services.",
      flag: "CRISIS_REDIRECT"
    };
  }

  // 3. Prompt Injection & Security Guardrails
  if (/ignore (?:all )?(?:previous|above|prior)|disregard.*(?:system|instructions)|you are now|jailbreak|pretend you are|override.*(?:safety|system)|bypass.*(?:rules|guardrail)|<\/?(?:system|caregiver_query)>|\[system\]|system\s*:|(?:other|all) (?:patients?|recipients?)|(?:show|reveal|print).*(?:secret|api key|system prompt)|(?:hurt|poison|harm|restrain) (?:him|her|dad|mum|mom|them)/i.test(trimmed)) {
    return { message: "I can help explain recorded activities for the selected person. I cannot follow instructions to bypass safeguards, expose private information, or harm someone.", flag: "PROMPT_INJECTION_DEFLECTION" };
  }

  // 2. Unsupported Medical Diagnosis & Treatment Advice
  if (/\b(?:uti|urinary tract infection|alzheimer\w*|dementia|delirium|stroke|sepsis|pneumonia|depression|insomnia|sleep apnea|parkinson\w*|hypertension|heart attack|infection|covid|influenza|diagnos\w*|prescribe|dosage)\b|is (?:she|he|they) sick|what illness|medical condition|medication (?:side effect|reaction)|drug interaction|should i (?:give|administer)|treatment for|what pills/i.test(trimmed)) {
    return { message: "I can summarize recorded behavioral observations, but I cannot provide diagnoses, medical causes, or treatment advice. Please consult a qualified healthcare professional about medical questions.", flag: "UNSUPPORTED_MEDICAL_REDIRECT" };
  }

  // 3. Out-of-Scope: Math / Calculations
  if (/^\s*(?:what(?:'s|\s+is)\s+)?[-+]?\d+(?:\.\d+)?\s*[\+\-\*\/\^\%x×÷]\s*[-+]?\d+(?:\.\d+)?(?:\s*[\+\-\*\/\^\%x×÷=]\s*[-+]?\d+(?:\.\d+)?)*\s*\??\s*$/i.test(trimmed)) {
    return {
      message: "I am NAAI, your caregiving assistant for everyday care. I can only assist with questions about your loved one's recorded daily activities, routines, rest, meals, and behavioral observations. I cannot perform general arithmetic or calculations.",
      flag: "OUT_OF_SCOPE_REDIRECT"
    };
  }

  // 4. Out-of-Scope: Trivia, Politics, General AI, Coding, Weather
  if (/\b(?:who is (?:the )?(?:president|prime minister|governor|mayor|queen|king|ceo|vice president|founder)|who won (?:the )?(?:election|world cup|super bowl|game|match|oscar|grammy|championship)|what is the capital of|tell me a (?:joke|story|poem|riddle)|write (?:a |me )?(?:poem|song|code|script|essay|story|letter|sql)|how do i (?:code|program|hack|bake|cook|invest|build)|what is the weather|what time is it in|translate .* to|bitcoin|crypto|stock market)\b/i.test(trimmed)) {
    return {
      message: "I am NAAI, your caregiving assistant for everyday care. I can help you understand your loved one's daily activities, routines, rest, meals, and behavioral observations. I cannot assist with general knowledge, politics, or unrelated topics.",
      flag: "OUT_OF_SCOPE_REDIRECT"
    };
  }

  // Product questions are not requests for recipient evidence. Anchor the whole
  // message so an introduction followed by an activity question is not swallowed.
  const productQuestion = trimmed.replace(/[’]/g, "'").replace(/[?!.]+$/g, "").trim();
  if (/^(?:(?:hi|hello|hey)[, ]+)?(?:what(?: is|'s) (?:naai|gennaai)|who (?:are you|is naai)|(?:please )?(?:explain|describe|introduce) (?:naai|gennaai|yourself)|(?:please )?tell me about (?:naai|gennaai|yourself)|what (?:can|do) (?:you|naai) (?:do|help (?:me )?with)|how (?:can|does) (?:you|naai|gennaai) help(?: me)?|what (?:is your (?:purpose|role)|are your (?:capabilities|limitations)))$/i.test(productQuestion)) {
    return {
      message: "NAAI is GENNAAI’s caregiving assistant. I help family caregivers understand a loved one’s recorded activities, compare them with their usual routine, and explore changes with supporting evidence. You can ask about sleep, meals, daily routines, or behavioral changes, and follow up on an answer. I can explain what the records show, but I cannot determine someone’s emotions, diagnose a condition, or provide emergency monitoring.",
      flag: "CONVERSATIONAL_RESPONSE"
    };
  }

  const definition = explainConcept(trimmed);
  if (definition) return { message: definition, flag: "CONVERSATIONAL_RESPONSE" };

  // Social-only turns are intentionally local: no records or model quota required.
  if (/^(?:(?:ok|okay|alright|great|got it)[,! .]*)?(?:thanks(?: a lot)?|thank you(?: so much)?|thx|thankyou)[!. ]*$/i.test(trimmed) || /^(?:ok|okay|got it|understood|bye|goodbye)[!. ]*$/i.test(trimmed)) {
    return { message: /bye/i.test(trimmed) ? "Take care. I’m here when you need help." : "You’re welcome. I’m here if you need anything else.", flag: "CONVERSATIONAL_RESPONSE" };
  }

  // 5. Friendly Nurse Assistant Greeting
  if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening))\b[!.? ]*$/i.test(trimmed)) {
    return {
      message: "Hello! I am NAAI, your everyday caregiving assistant. I can help you monitor and understand your loved one's recorded daily activities, routines, rest, meals, and behavioral patterns. What would you like to know about their day?",
      flag: "GREETING_RESPONSE"
    };
  }

  // 6. Caregiving Context Guardrail: Queries completely lacking any caregiving, activity, or health relevance
  const hasCareContext = /\b(?:dad|mum|mom|he|him|his|she|her|they|them|person|patient|resident|father|mother|parent|loved\s+one|ordonez|sleep\w*|slept|nap\w*|rest\w*|wake\w*|waking|bed\w*|toilet\w*|bathroom\w*|restroom\w*|pee\w*|poop\w*|urinat\w*|eat\w*|meal\w*|breakfast\w*|lunch\w*|dinner\w*|snack\w*|food\w*|drink\w*|shower\w*|bath\w*|wash\w*|groom\w*|hygiene|pace\w*|pacing|wander\w*|walk\w*|vocal\w*|shout\w*|call\w*|voice\w*|noise\w*|transition\w*|movement|moving|agitat\w*|escalat\w*|calm\w*|distress\w*|crisis|episode\w*|behavior\w*|activity|activities|event\w*|routine\w*|schedule\w*|seat\w*|today|yesterday|morning|afternoon|evening|night|day\w*|week\w*|minute\w*|hour\w*|usual|normal|baseline|change\w*|different\w*|compar\w*|trend\w*|pattern\w*|frequent\w*|often|doing|summary|overview|update|evidence|timeline|record\w*|log\w*|sensor\w*|observation\w*|status|how\s+was|how\s+did|how\s+is|is\s+he|is\s+she|is\s+dad|did\s+he|did\s+she|was\s+that|is\s+that|care\w*|nurse\w*|naai|gennaai)\b/i.test(trimmed);

  if (!hasCareContext && !/\b(?:behaviour\w*|unbehaviour\w*)\b/i.test(trimmed) && !(hasPreviousContext && isFollowUp(trimmed))) {
    if (isFollowUp(trimmed)) return { message: "Which recorded change would you like me to explain? Ask about sleep, daily routine, or a behavioral change so I can find the relevant evidence.", flag: "CONTEXT_REQUIRED" };
    return {
      message: "I am NAAI, your caregiving assistant for everyday care. I can help explain your loved one's recorded activities, sleep, meals, bathroom visits, and behavioral observations. How can I help with their care today?",
      flag: "OUT_OF_SCOPE_REDIRECT"
    };
  }

  return null;
}
