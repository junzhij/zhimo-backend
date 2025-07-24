import { AIService, createAIService } from '../../services/aiService';
import {
  StructuredText,
  KnowledgeElement,
  QuestionGenerationOptions,
  QuestionGenerationResult,
  MultipleChoiceQuestion,
  FillInBlankQuestion,
  ShortAnswerQuestion,
  EssayQuestion,
  FlashcardOptions,
  FlashcardGenerationResult,
  Flashcard,
  OpenEndedQuestionOptions,
  OpenEndedQuestionResult,
  OpenEndedQuestion
} from '../../types';
import { v4 as uuidv4 } from 'uuid';

// Pedagogy Agent - Generates educational content like flashcards and questions
export class PedagogyAgent {
  private aiService: AIService;

  constructor(aiService?: AIService) {
    this.aiService = aiService || createAIService();
  }

  /**
   * Generate various types of questions from structured text
   */
  async generateQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: QuestionGenerationOptions
  ): Promise<QuestionGenerationResult> {
    const result: QuestionGenerationResult = {
      multipleChoice: [],
      fillInBlank: [],
      shortAnswer: [],
      essay: [],
      totalGenerated: 0,
      confidence: 0
    };

    try {
      // Generate questions based on requested types
      const promises: Promise<void>[] = [];

      if (options.questionTypes.includes('multiple_choice')) {
        promises.push(this.generateMultipleChoiceQuestions(structuredText, knowledgeElements, options).then(questions => {
          result.multipleChoice = questions;
        }));
      }

      if (options.questionTypes.includes('fill_in_blank')) {
        promises.push(this.generateFillInBlankQuestions(structuredText, knowledgeElements, options).then(questions => {
          result.fillInBlank = questions;
        }));
      }

      if (options.questionTypes.includes('short_answer')) {
        promises.push(this.generateShortAnswerQuestions(structuredText, knowledgeElements, options).then(questions => {
          result.shortAnswer = questions;
        }));
      }

      if (options.questionTypes.includes('essay')) {
        promises.push(this.generateEssayQuestions(structuredText, knowledgeElements, options).then(questions => {
          result.essay = questions;
        }));
      }

      await Promise.all(promises);

      result.totalGenerated = result.multipleChoice.length + result.fillInBlank.length + 
                             result.shortAnswer.length + result.essay.length;
      result.confidence = result.totalGenerated > 0 ? 0.85 : 0.3;

      return result;
    } catch (error) {
      console.error('Error generating questions:', error);
      throw new Error(`Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate multiple choice questions
   */
  private async generateMultipleChoiceQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: QuestionGenerationOptions
  ): Promise<MultipleChoiceQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.4); // 40% of total questions
    const prompt = this.buildMultipleChoicePrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in multiple choice question generation. Create clear, unambiguous questions with plausible distractors.',
      prompt,
      {
        maxTokens: 2000,
        temperature: 0.3
      }
    );

    return this.parseMultipleChoiceResponse(content, options.difficulty);
  }

  private buildMultipleChoicePrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: QuestionGenerationOptions
  ): string {
    const difficultyInstructions = {
      easy: 'Focus on basic recall and recognition of key facts and definitions',
      medium: 'Include application and comprehension questions that require understanding',
      hard: 'Create analysis and synthesis questions that require critical thinking'
    };

    let prompt = `Generate ${numQuestions} multiple choice questions based on the following content.

Requirements:
- Difficulty: ${options.difficulty} - ${difficultyInstructions[options.difficulty]}
- Each question should have 4 options (A, B, C, D)
- Only one correct answer per question
- Include plausible distractors (wrong answers that seem reasonable)
- Provide brief explanations for the correct answers
- Reference the source section where the answer can be found`;

    if (options.focusAreas && options.focusAreas.length > 0) {
      prompt += `\n- Focus particularly on these areas: ${options.focusAreas.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Your question here]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [A/B/C/D]
Explanation: [Brief explanation of why this is correct]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
${section.subsections?.map(sub => `  Subsection: ${sub.heading}\n  ${sub.content}`).join('\n') || ''}
`).join('\n')}

KNOWLEDGE ELEMENTS:
${knowledgeElements.map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  private parseMultipleChoiceResponse(content: string, difficulty: string): MultipleChoiceQuestion[] {
    const questions: MultipleChoiceQuestion[] = [];
    const questionBlocks = content.split(/QUESTION_\d+:/).filter(block => block.trim());

    for (const block of questionBlocks) {
      try {
        const questionMatch = block.match(/Question:\s*(.+)/);
        const optionAMatch = block.match(/A\)\s*(.+)/);
        const optionBMatch = block.match(/B\)\s*(.+)/);
        const optionCMatch = block.match(/C\)\s*(.+)/);
        const optionDMatch = block.match(/D\)\s*(.+)/);
        const correctMatch = block.match(/Correct:\s*([ABCD])/);
        const explanationMatch = block.match(/Explanation:\s*(.+)/);
        const sectionMatch = block.match(/Section:\s*(.+)/);
        const tagsMatch = block.match(/Tags:\s*(.+)/);

        if (questionMatch && optionAMatch && optionBMatch && optionCMatch && 
            optionDMatch && correctMatch && explanationMatch && sectionMatch) {
          
          const correctAnswerMap: { [key: string]: number } = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
          const correctIndex = correctAnswerMap[correctMatch[1]];

          questions.push({
            id: uuidv4(),
            question: questionMatch[1].trim(),
            options: [
              optionAMatch[1].trim(),
              optionBMatch[1].trim(),
              optionCMatch[1].trim(),
              optionDMatch[1].trim()
            ],
            correctAnswer: correctIndex,
            explanation: explanationMatch[1].trim(),
            difficulty: difficulty as 'easy' | 'medium' | 'hard',
            sourceLocation: {
              section: sectionMatch[1].trim()
            },
            tags: tagsMatch ? tagsMatch[1].split(',').map(tag => tag.trim()) : []
          });
        }
      } catch (error) {
        console.error('Error parsing multiple choice question:', error);
      }
    }

    return questions;
  }

  /**
   * Generate fill-in-the-blank questions
   */
  private async generateFillInBlankQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: QuestionGenerationOptions
  ): Promise<FillInBlankQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.25); // 25% of total questions
    const prompt = this.buildFillInBlankPrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in fill-in-the-blank questions. Create questions that test key terms, concepts, and relationships.',
      prompt,
      {
        maxTokens: 1500,
        temperature: 0.3
      }
    );

    return this.parseFillInBlankResponse(content, options.difficulty);
  }

  private buildFillInBlankPrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: QuestionGenerationOptions
  ): string {
    let prompt = `Generate ${numQuestions} fill-in-the-blank questions based on the following content.

Requirements:
- Difficulty: ${options.difficulty}
- Use ___ to mark blanks in sentences
- Focus on key terms, definitions, formulas, and important concepts
- Provide the correct answers for each blank
- Include brief explanations
- Reference the source section`;

    if (options.focusAreas && options.focusAreas.length > 0) {
      prompt += `\n- Focus particularly on these areas: ${options.focusAreas.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Sentence with ___ for blanks]
Answers: [answer1, answer2] (if multiple blanks)
Explanation: [Brief explanation]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
`).join('\n')}

KNOWLEDGE ELEMENTS (focus on definitions and key terms):
${knowledgeElements.filter(el => el.element_type === 'definition' || el.element_type === 'concept').map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  private parseFillInBlankResponse(content: string, difficulty: string): FillInBlankQuestion[] {
    const questions: FillInBlankQuestion[] = [];
    const questionBlocks = content.split(/QUESTION_\d+:/).filter(block => block.trim());

    for (const block of questionBlocks) {
      try {
        const questionMatch = block.match(/Question:\s*(.+)/);
        const answersMatch = block.match(/Answers:\s*(.+)/);
        const explanationMatch = block.match(/Explanation:\s*(.+)/);
        const sectionMatch = block.match(/Section:\s*(.+)/);
        const tagsMatch = block.match(/Tags:\s*(.+)/);

        if (questionMatch && answersMatch && explanationMatch && sectionMatch) {
          // Parse answers - could be single answer or comma-separated list
          const answersText = answersMatch[1].trim();
          const answers = answersText.includes(',') ? 
            answersText.split(',').map(a => a.trim().replace(/^\[|\]$/g, '')) :
            [answersText.replace(/^\[|\]$/g, '')];

          questions.push({
            id: uuidv4(),
            question: questionMatch[1].trim(),
            answers,
            explanation: explanationMatch[1].trim(),
            difficulty: difficulty as 'easy' | 'medium' | 'hard',
            sourceLocation: {
              section: sectionMatch[1].trim()
            },
            tags: tagsMatch ? tagsMatch[1].split(',').map(tag => tag.trim()) : []
          });
        }
      } catch (error) {
        console.error('Error parsing fill-in-blank question:', error);
      }
    }

    return questions;
  }

  /**
   * Generate short answer questions
   */
  private async generateShortAnswerQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: QuestionGenerationOptions
  ): Promise<ShortAnswerQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.25); // 25% of total questions
    const prompt = this.buildShortAnswerPrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in short answer questions. Create questions that require brief explanations and demonstrate understanding.',
      prompt,
      {
        maxTokens: 1500,
        temperature: 0.3
      }
    );

    return this.parseShortAnswerResponse(content, options.difficulty);
  }

  private buildShortAnswerPrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: QuestionGenerationOptions
  ): string {
    let prompt = `Generate ${numQuestions} short answer questions based on the following content.

Requirements:
- Difficulty: ${options.difficulty}
- Questions should require 2-4 sentence answers
- Focus on explanations, processes, and relationships
- Provide sample answers and key points that should be included
- Reference the source section`;

    if (options.focusAreas && options.focusAreas.length > 0) {
      prompt += `\n- Focus particularly on these areas: ${options.focusAreas.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Your question here]
Sample Answer: [2-4 sentence sample answer]
Key Points: [point1, point2, point3]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
`).join('\n')}

KNOWLEDGE ELEMENTS:
${knowledgeElements.map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  private parseShortAnswerResponse(content: string, difficulty: string): ShortAnswerQuestion[] {
    const questions: ShortAnswerQuestion[] = [];
    const questionBlocks = content.split(/QUESTION_\d+:/).filter(block => block.trim());

    for (const block of questionBlocks) {
      try {
        const questionMatch = block.match(/Question:\s*(.+)/);
        const sampleAnswerMatch = block.match(/Sample Answer:\s*(.+)/);
        const keyPointsMatch = block.match(/Key Points:\s*(.+)/);
        const sectionMatch = block.match(/Section:\s*(.+)/);
        const tagsMatch = block.match(/Tags:\s*(.+)/);

        if (questionMatch && sampleAnswerMatch && keyPointsMatch && sectionMatch) {
          const keyPoints = keyPointsMatch[1].split(',').map(point => point.trim().replace(/^\[|\]$/g, ''));

          questions.push({
            id: uuidv4(),
            question: questionMatch[1].trim(),
            sampleAnswer: sampleAnswerMatch[1].trim(),
            keyPoints,
            difficulty: difficulty as 'easy' | 'medium' | 'hard',
            sourceLocation: {
              section: sectionMatch[1].trim()
            },
            tags: tagsMatch ? tagsMatch[1].split(',').map(tag => tag.trim()) : []
          });
        }
      } catch (error) {
        console.error('Error parsing short answer question:', error);
      }
    }

    return questions;
  }

  /**
   * Generate essay questions
   */
  private async generateEssayQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: QuestionGenerationOptions
  ): Promise<EssayQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.1); // 10% of total questions
    const prompt = this.buildEssayPrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in essay questions. Create questions that require deep analysis, synthesis, and critical thinking.',
      prompt,
      {
        maxTokens: 1500,
        temperature: 0.4
      }
    );

    return this.parseEssayResponse(content, options.difficulty);
  }

  private buildEssayPrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: QuestionGenerationOptions
  ): string {
    let prompt = `Generate ${numQuestions} essay questions based on the following content.

Requirements:
- Difficulty: ${options.difficulty}
- Questions should require extended responses (300-800 words)
- Focus on analysis, synthesis, evaluation, and critical thinking
- Provide guidelines for answering and key themes to address
- Reference the source section`;

    if (options.focusAreas && options.focusAreas.length > 0) {
      prompt += `\n- Focus particularly on these areas: ${options.focusAreas.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Your essay question here]
Guidelines: [Guidelines for answering the question]
Key Themes: [theme1, theme2, theme3]
Length: [suggested word count range]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
`).join('\n')}

KNOWLEDGE ELEMENTS (focus on themes and arguments):
${knowledgeElements.filter(el => el.element_type === 'theme' || el.element_type === 'argument').map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  private parseEssayResponse(content: string, difficulty: string): EssayQuestion[] {
    const questions: EssayQuestion[] = [];
    const questionBlocks = content.split(/QUESTION_\d+:/).filter(block => block.trim());

    for (const block of questionBlocks) {
      try {
        const questionMatch = block.match(/Question:\s*(.+)/);
        const guidelinesMatch = block.match(/Guidelines:\s*(.+)/);
        const keyThemesMatch = block.match(/Key Themes:\s*(.+)/);
        const lengthMatch = block.match(/Length:\s*(.+)/);
        const sectionMatch = block.match(/Section:\s*(.+)/);
        const tagsMatch = block.match(/Tags:\s*(.+)/);

        if (questionMatch && guidelinesMatch && keyThemesMatch && lengthMatch && sectionMatch) {
          const keyThemes = keyThemesMatch[1].split(',').map(theme => theme.trim().replace(/^\[|\]$/g, ''));

          questions.push({
            id: uuidv4(),
            question: questionMatch[1].trim(),
            guidelines: guidelinesMatch[1].trim(),
            keyThemes,
            suggestedLength: lengthMatch[1].trim(),
            difficulty: difficulty as 'easy' | 'medium' | 'hard',
            sourceLocation: {
              section: sectionMatch[1].trim()
            },
            tags: tagsMatch ? tagsMatch[1].split(',').map(tag => tag.trim()) : []
          });
        }
      } catch (error) {
        console.error('Error parsing essay question:', error);
      }
    }

    return questions;
  }

  /**
   * Generate flashcards from knowledge elements
   */
  async generateFlashcards(
    knowledgeElements: KnowledgeElement[],
    options: FlashcardOptions
  ): Promise<FlashcardGenerationResult> {
    try {
      const flashcards: Flashcard[] = [];

      // Filter knowledge elements based on options
      const filteredElements = this.filterKnowledgeElementsForFlashcards(knowledgeElements, options);

      if (filteredElements.length === 0) {
        return {
          flashcards: [],
          totalGenerated: 0,
          confidence: 0.3
        };
      }

      // Generate flashcards from different types of knowledge elements
      const promises: Promise<Flashcard[]>[] = [];

      if (options.includeDefinitions) {
        const definitions = filteredElements.filter(el => el.element_type === 'definition');
        if (definitions.length > 0) {
          promises.push(this.generateDefinitionFlashcards(definitions, options));
        }
      }

      if (options.includeFormulas) {
        const formulas = filteredElements.filter(el => el.element_type === 'formula');
        if (formulas.length > 0) {
          promises.push(this.generateFormulaFlashcards(formulas, options));
        }
      }

      if (options.includeConcepts) {
        const concepts = filteredElements.filter(el => el.element_type === 'concept');
        if (concepts.length > 0) {
          promises.push(this.generateConceptFlashcards(concepts, options));
        }
      }

      const results = await Promise.all(promises);
      results.forEach(result => flashcards.push(...result));

      return {
        flashcards,
        totalGenerated: flashcards.length,
        confidence: flashcards.length > 0 ? 0.9 : 0.3
      };
    } catch (error) {
      console.error('Error generating flashcards:', error);
      throw new Error(`Failed to generate flashcards: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Filter knowledge elements based on flashcard options
   */
  private filterKnowledgeElementsForFlashcards(
    elements: KnowledgeElement[],
    options: FlashcardOptions
  ): KnowledgeElement[] {
    return elements.filter(element => {
      if (options.includeDefinitions && element.element_type === 'definition') return true;
      if (options.includeFormulas && element.element_type === 'formula') return true;
      if (options.includeConcepts && element.element_type === 'concept') return true;
      return false;
    });
  }

  /**
   * Generate flashcards from definition knowledge elements
   */
  private async generateDefinitionFlashcards(
    definitions: KnowledgeElement[],
    options: FlashcardOptions
  ): Promise<Flashcard[]> {
    const flashcards: Flashcard[] = [];

    for (const definition of definitions) {
      const prompt = this.buildDefinitionFlashcardPrompt(definition, options);
      
      const content = await this.aiService.generateCompletion(
        'You are an expert educational content creator specializing in flashcard generation. Create clear, concise flashcards that help students memorize and understand key definitions.',
        prompt,
        {
          maxTokens: 500,
          temperature: 0.2
        }
      );

      const parsedFlashcards = this.parseFlashcardResponse(content, 'definition', options);
      flashcards.push(...parsedFlashcards);
    }

    return flashcards;
  }

  private buildDefinitionFlashcardPrompt(
    definition: KnowledgeElement,
    options: FlashcardOptions
  ): string {
    return `Create a flashcard from the following definition:

Title: ${definition.content.title}
Definition: ${definition.content.body}
Section: ${definition.source_location.section}
Tags: ${definition.tags.join(', ')}

Requirements:
- Difficulty: ${options.difficulty}
- Create a clear front/back card structure
- Front should be the term or concept
- Back should be the definition or explanation
- Keep it concise but complete
- Include any important details or context

Format your response exactly as follows:

FLASHCARD_1:
Front: [Term or question]
Back: [Definition or answer]
Type: definition
Section: [Source section]
Tags: [comma-separated tags]

Generate 1-2 flashcards from this definition.`;
  }

  /**
   * Generate flashcards from formula knowledge elements
   */
  private async generateFormulaFlashcards(
    formulas: KnowledgeElement[],
    options: FlashcardOptions
  ): Promise<Flashcard[]> {
    const flashcards: Flashcard[] = [];

    for (const formula of formulas) {
      const prompt = this.buildFormulaFlashcardPrompt(formula, options);
      
      const content = await this.aiService.generateCompletion(
        'You are an expert educational content creator specializing in formula flashcards. Create flashcards that help students memorize formulas and understand their applications.',
        prompt,
        {
          maxTokens: 500,
          temperature: 0.2
        }
      );

      const parsedFlashcards = this.parseFlashcardResponse(content, 'formula', options);
      flashcards.push(...parsedFlashcards);
    }

    return flashcards;
  }

  private buildFormulaFlashcardPrompt(
    formula: KnowledgeElement,
    options: FlashcardOptions
  ): string {
    return `Create flashcards from the following formula:

Title: ${formula.content.title}
Formula: ${formula.content.body}
Section: ${formula.source_location.section}
Tags: ${formula.tags.join(', ')}

Requirements:
- Difficulty: ${options.difficulty}
- Create multiple flashcards: one for the formula itself, one for its application
- Include variable definitions if applicable
- Keep mathematical notation clear

Format your response exactly as follows:

FLASHCARD_1:
Front: [What is the formula for ${formula.content.title}?]
Back: [Formula with variable definitions]
Type: formula
Section: [Source section]
Tags: [comma-separated tags]

FLASHCARD_2:
Front: [When do you use ${formula.content.title}?]
Back: [Application and context]
Type: formula
Section: [Source section]
Tags: [comma-separated tags]

Generate 1-2 flashcards from this formula.`;
  }

  /**
   * Generate flashcards from concept knowledge elements
   */
  private async generateConceptFlashcards(
    concepts: KnowledgeElement[],
    options: FlashcardOptions
  ): Promise<Flashcard[]> {
    const flashcards: Flashcard[] = [];

    for (const concept of concepts) {
      const prompt = this.buildConceptFlashcardPrompt(concept, options);
      
      const content = await this.aiService.generateCompletion(
        'You are an expert educational content creator specializing in concept flashcards. Create flashcards that help students understand and remember key concepts and their relationships.',
        prompt,
        {
          maxTokens: 500,
          temperature: 0.2
        }
      );

      const parsedFlashcards = this.parseFlashcardResponse(content, 'concept', options);
      flashcards.push(...parsedFlashcards);
    }

    return flashcards;
  }

  private buildConceptFlashcardPrompt(
    concept: KnowledgeElement,
    options: FlashcardOptions
  ): string {
    return `Create flashcards from the following concept:

Title: ${concept.content.title}
Concept: ${concept.content.body}
Section: ${concept.source_location.section}
Tags: ${concept.tags.join(', ')}

Requirements:
- Difficulty: ${options.difficulty}
- Create clear, focused flashcards
- Front should test understanding of the concept
- Back should provide explanation and context
- Include key characteristics or examples if relevant

Format your response exactly as follows:

FLASHCARD_1:
Front: [Question about the concept]
Back: [Explanation and key points]
Type: concept
Section: [Source section]
Tags: [comma-separated tags]

Generate 1-2 flashcards from this concept.`;
  }

  /**
   * Parse flashcard response from AI service
   */
  private parseFlashcardResponse(
    content: string,
    cardType: 'definition' | 'formula' | 'concept' | 'fact',
    options: FlashcardOptions
  ): Flashcard[] {
    const flashcards: Flashcard[] = [];
    const flashcardBlocks = content.split(/FLASHCARD_\d+:/).filter(block => block.trim());

    for (const block of flashcardBlocks) {
      try {
        const frontMatch = block.match(/Front:\s*(.+)/);
        const backMatch = block.match(/Back:\s*(.+)/);
        const typeMatch = block.match(/Type:\s*(.+)/);
        const sectionMatch = block.match(/Section:\s*(.+)/);
        const tagsMatch = block.match(/Tags:\s*(.+)/);

        if (frontMatch && backMatch && sectionMatch) {
          const flashcard: Flashcard = {
            id: uuidv4(),
            front: frontMatch[1].trim(),
            back: backMatch[1].trim(),
            cardType: cardType,
            difficulty: options.difficulty,
            sourceLocation: {
              section: sectionMatch[1].trim()
            },
            tags: tagsMatch ? tagsMatch[1].split(',').map(tag => tag.trim()) : []
          };

          // Add spaced repetition data if enabled
          if (options.spacedRepetition) {
            flashcard.spacedRepetitionData = {
              easeFactor: 2.5, // Default ease factor
              interval: 1, // Start with 1 day interval
              repetitions: 0,
              nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
            };
          }

          flashcards.push(flashcard);
        }
      } catch (error) {
        console.error('Error parsing flashcard:', error);
      }
    }

    return flashcards;
  }

  /**
   * Generate open-ended questions for discussion and critical thinking
   */
  async generateOpenEndedQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: OpenEndedQuestionOptions
  ): Promise<OpenEndedQuestionResult> {
    try {
      const questions: OpenEndedQuestion[] = [];

      // Generate questions based on requested types
      const promises: Promise<OpenEndedQuestion[]>[] = [];

      if (options.questionTypes.includes('discussion')) {
        promises.push(this.generateDiscussionQuestions(structuredText, knowledgeElements, options));
      }

      if (options.questionTypes.includes('critical_thinking')) {
        promises.push(this.generateCriticalThinkingQuestions(structuredText, knowledgeElements, options));
      }

      if (options.questionTypes.includes('socratic')) {
        promises.push(this.generateSocraticQuestions(structuredText, knowledgeElements, options));
      }

      if (options.questionTypes.includes('analysis')) {
        promises.push(this.generateAnalysisQuestions(structuredText, knowledgeElements, options));
      }

      const results = await Promise.all(promises);
      results.forEach(result => questions.push(...result));

      return {
        questions,
        totalGenerated: questions.length,
        confidence: questions.length > 0 ? 0.85 : 0.3
      };
    } catch (error) {
      console.error('Error generating open-ended questions:', error);
      throw new Error(`Failed to generate open-ended questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate discussion questions
   */
  private async generateDiscussionQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: OpenEndedQuestionOptions
  ): Promise<OpenEndedQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.3); // 30% of total questions
    const prompt = this.buildDiscussionQuestionPrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in discussion questions. Create questions that encourage collaborative learning, debate, and sharing of perspectives.',
      prompt,
      {
        maxTokens: 1500,
        temperature: 0.4
      }
    );

    return this.parseOpenEndedResponse(content, 'discussion', options);
  }

  private buildDiscussionQuestionPrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: OpenEndedQuestionOptions
  ): string {
    let prompt = `Generate ${numQuestions} discussion questions based on the following content.

Requirements:
- Complexity: ${options.complexity}
- Create questions that encourage group discussion and debate
- Questions should have multiple valid perspectives or answers
- Encourage students to share experiences and viewpoints
- Promote collaborative learning and peer interaction`;

    if (options.focusThemes && options.focusThemes.length > 0) {
      prompt += `\n- Focus particularly on these themes: ${options.focusThemes.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Your discussion question here]
Type: discussion
Complexity: ${options.complexity}
Guiding Points: [point1, point2, point3]
Related Concepts: [concept1, concept2, concept3]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
`).join('\n')}

KNOWLEDGE ELEMENTS (focus on themes and concepts):
${knowledgeElements.filter(el => el.element_type === 'theme' || el.element_type === 'concept').map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  /**
   * Generate critical thinking questions
   */
  private async generateCriticalThinkingQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: OpenEndedQuestionOptions
  ): Promise<OpenEndedQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.3); // 30% of total questions
    const prompt = this.buildCriticalThinkingPrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in critical thinking questions. Create questions that challenge assumptions, require analysis, and promote deeper understanding.',
      prompt,
      {
        maxTokens: 1500,
        temperature: 0.4
      }
    );

    return this.parseOpenEndedResponse(content, 'critical_thinking', options);
  }

  private buildCriticalThinkingPrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: OpenEndedQuestionOptions
  ): string {
    let prompt = `Generate ${numQuestions} critical thinking questions based on the following content.

Requirements:
- Complexity: ${options.complexity}
- Challenge assumptions and conventional thinking
- Require analysis, evaluation, and synthesis
- Promote deeper understanding beyond surface-level facts
- Encourage questioning of evidence and reasoning`;

    if (options.focusThemes && options.focusThemes.length > 0) {
      prompt += `\n- Focus particularly on these themes: ${options.focusThemes.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Your critical thinking question here]
Type: critical_thinking
Complexity: ${options.complexity}
Guiding Points: [point1, point2, point3]
Related Concepts: [concept1, concept2, concept3]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
`).join('\n')}

KNOWLEDGE ELEMENTS (focus on arguments and themes):
${knowledgeElements.filter(el => el.element_type === 'argument' || el.element_type === 'theme').map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  /**
   * Generate Socratic-style questions
   */
  private async generateSocraticQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: OpenEndedQuestionOptions
  ): Promise<OpenEndedQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.25); // 25% of total questions
    const prompt = this.buildSocraticPrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in Socratic questioning. Create questions that guide students to discover knowledge through inquiry and self-reflection.',
      prompt,
      {
        maxTokens: 1500,
        temperature: 0.4
      }
    );

    return this.parseOpenEndedResponse(content, 'socratic', options);
  }

  private buildSocraticPrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: OpenEndedQuestionOptions
  ): string {
    let prompt = `Generate ${numQuestions} Socratic-style questions based on the following content.

Requirements:
- Complexity: ${options.complexity}
- Use the Socratic method to guide discovery through questioning
- Questions should lead students to examine their own thinking
- Encourage self-reflection and deeper inquiry
- Build upon previous knowledge to reach new understanding
- Use "What if...", "How do you know...", "Why do you think..." patterns`;

    if (options.focusThemes && options.focusThemes.length > 0) {
      prompt += `\n- Focus particularly on these themes: ${options.focusThemes.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Your Socratic question here]
Type: socratic
Complexity: ${options.complexity}
Guiding Points: [point1, point2, point3]
Related Concepts: [concept1, concept2, concept3]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
`).join('\n')}

KNOWLEDGE ELEMENTS:
${knowledgeElements.map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  /**
   * Generate analysis questions
   */
  private async generateAnalysisQuestions(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    options: OpenEndedQuestionOptions
  ): Promise<OpenEndedQuestion[]> {
    const numQuestions = Math.ceil(options.numQuestions * 0.15); // 15% of total questions
    const prompt = this.buildAnalysisPrompt(structuredText, knowledgeElements, numQuestions, options);

    const content = await this.aiService.generateCompletion(
      'You are an expert educational content creator specializing in analytical questions. Create questions that require systematic examination, comparison, and evaluation of information.',
      prompt,
      {
        maxTokens: 1500,
        temperature: 0.4
      }
    );

    return this.parseOpenEndedResponse(content, 'analysis', options);
  }

  private buildAnalysisPrompt(
    structuredText: StructuredText,
    knowledgeElements: KnowledgeElement[],
    numQuestions: number,
    options: OpenEndedQuestionOptions
  ): string {
    let prompt = `Generate ${numQuestions} analysis questions based on the following content.

Requirements:
- Complexity: ${options.complexity}
- Require systematic examination and breakdown of information
- Include comparison, contrast, and evaluation tasks
- Focus on relationships between concepts and ideas
- Encourage evidence-based reasoning and conclusions`;

    if (options.focusThemes && options.focusThemes.length > 0) {
      prompt += `\n- Focus particularly on these themes: ${options.focusThemes.join(', ')}`;
    }

    prompt += `\n\nFormat each question exactly as follows:

QUESTION_1:
Question: [Your analysis question here]
Type: analysis
Complexity: ${options.complexity}
Guiding Points: [point1, point2, point3]
Related Concepts: [concept1, concept2, concept3]
Section: [Source section name]
Tags: [comma-separated relevant tags]

[Continue for all questions...]

Content to base questions on:

STRUCTURED TEXT:
Title: ${structuredText.title}
${structuredText.sections.map(section => `
Section: ${section.heading}
${section.content}
`).join('\n')}

KNOWLEDGE ELEMENTS (focus on relationships and structures):
${knowledgeElements.filter(el => el.element_type === 'relationship' || el.element_type === 'structure').map(element => `
Type: ${element.element_type}
Title: ${element.content.title}
Content: ${element.content.body}
Section: ${element.source_location.section}
`).join('\n')}`;

    return prompt;
  }

  /**
   * Parse open-ended question response from AI service
   */
  private parseOpenEndedResponse(
    content: string,
    questionType: 'discussion' | 'critical_thinking' | 'socratic' | 'analysis',
    options: OpenEndedQuestionOptions
  ): OpenEndedQuestion[] {
    const questions: OpenEndedQuestion[] = [];
    const questionBlocks = content.split(/QUESTION_\d+:/).filter(block => block.trim());

    for (const block of questionBlocks) {
      try {
        const questionMatch = block.match(/Question:\s*(.+)/);
        const typeMatch = block.match(/Type:\s*(.+)/);
        const complexityMatch = block.match(/Complexity:\s*(.+)/);
        const guidingPointsMatch = block.match(/Guiding Points:\s*(.+)/);
        const relatedConceptsMatch = block.match(/Related Concepts:\s*(.+)/);
        const sectionMatch = block.match(/Section:\s*(.+)/);
        const tagsMatch = block.match(/Tags:\s*(.+)/);

        if (questionMatch && guidingPointsMatch && relatedConceptsMatch && sectionMatch) {
          const guidingPoints = guidingPointsMatch[1].split(',').map(point => point.trim().replace(/^\[|\]$/g, ''));
          const relatedConcepts = relatedConceptsMatch[1].split(',').map(concept => concept.trim().replace(/^\[|\]$/g, ''));

          questions.push({
            id: uuidv4(),
            question: questionMatch[1].trim(),
            questionType: questionType,
            complexity: options.complexity,
            guidingPoints,
            relatedConcepts,
            sourceLocation: {
              section: sectionMatch[1].trim()
            },
            tags: tagsMatch ? tagsMatch[1].split(',').map(tag => tag.trim()) : []
          });
        }
      } catch (error) {
        console.error('Error parsing open-ended question:', error);
      }
    }

    return questions;
  }
}