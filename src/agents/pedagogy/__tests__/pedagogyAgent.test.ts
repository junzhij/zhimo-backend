import { PedagogyAgent } from '../index';
import { AIService } from '../../../services/aiService';
import {
  StructuredText,
  KnowledgeElement,
  QuestionGenerationOptions,
  FlashcardOptions,
  OpenEndedQuestionOptions
} from '../../../types';

// Mock AI Service
const mockAIService = {
  generateCompletion: jest.fn()
} as unknown as AIService;

describe('PedagogyAgent - Question Generation', () => {
  let pedagogyAgent: PedagogyAgent;

  beforeEach(() => {
    pedagogyAgent = new PedagogyAgent(mockAIService);
    jest.clearAllMocks();
  });

  const mockStructuredText: StructuredText = {
    title: 'Introduction to Machine Learning',
    sections: [
      {
        heading: 'What is Machine Learning?',
        content: 'Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed.',
        subsections: [
          {
            heading: 'Types of Machine Learning',
            content: 'There are three main types: supervised learning, unsupervised learning, and reinforcement learning.'
          }
        ]
      },
      {
        heading: 'Applications',
        content: 'Machine learning is used in various applications including image recognition, natural language processing, and recommendation systems.'
      }
    ],
    metadata: {
      wordCount: 150,
      pageCount: 2,
      language: 'en'
    }
  };

  const mockKnowledgeElements: KnowledgeElement[] = [
    {
      document_id: 'doc-1',
      agent_type: 'extraction',
      element_type: 'definition',
      content: {
        title: 'Machine Learning',
        body: 'A subset of artificial intelligence that enables computers to learn from data'
      },
      source_location: {
        section: 'What is Machine Learning?',
        page: 1
      },
      created_at: new Date(),
      tags: ['AI', 'ML', 'definition']
    },
    {
      document_id: 'doc-1',
      agent_type: 'extraction',
      element_type: 'concept',
      content: {
        title: 'Supervised Learning',
        body: 'A type of machine learning where the algorithm learns from labeled training data'
      },
      source_location: {
        section: 'Types of Machine Learning',
        page: 1
      },
      created_at: new Date(),
      tags: ['ML', 'supervised', 'concept']
    }
  ];

  describe('generateQuestions', () => {
    it('should generate multiple choice questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: What is machine learning?
A) A programming language
B) A subset of artificial intelligence
C) A database system
D) A web framework
Correct: B
Explanation: Machine learning is defined as a subset of artificial intelligence that enables computers to learn from data.
Section: What is Machine Learning?
Tags: AI, ML, definition`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['multiple_choice'],
        difficulty: 'medium',
        numQuestions: 5
      };

      const result = await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      expect(result.multipleChoice).toHaveLength(1);
      expect(result.multipleChoice[0]).toMatchObject({
        question: 'What is machine learning?',
        options: [
          'A programming language',
          'A subset of artificial intelligence',
          'A database system',
          'A web framework'
        ],
        correctAnswer: 1,
        explanation: 'Machine learning is defined as a subset of artificial intelligence that enables computers to learn from data.',
        difficulty: 'medium'
      });
      expect(result.totalGenerated).toBe(1);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should generate fill-in-blank questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: Machine learning is a ___ of artificial intelligence that enables computers to learn from ___.
Answers: [subset, data]
Explanation: Machine learning is a subset of AI that learns from data.
Section: What is Machine Learning?
Tags: AI, ML, definition`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['fill_in_blank'],
        difficulty: 'easy',
        numQuestions: 4
      };

      const result = await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      expect(result.fillInBlank).toHaveLength(1);
      expect(result.fillInBlank[0]).toMatchObject({
        question: 'Machine learning is a ___ of artificial intelligence that enables computers to learn from ___.',
        answers: ['subset', 'data'],
        explanation: 'Machine learning is a subset of AI that learns from data.',
        difficulty: 'easy'
      });
    });

    it('should generate short answer questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: Explain the main difference between supervised and unsupervised learning.
Sample Answer: Supervised learning uses labeled training data to learn patterns, while unsupervised learning finds patterns in data without labels.
Key Points: [labeled data, pattern recognition, training process]
Section: Types of Machine Learning
Tags: supervised, unsupervised, learning types`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['short_answer'],
        difficulty: 'medium',
        numQuestions: 4
      };

      const result = await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      expect(result.shortAnswer).toHaveLength(1);
      expect(result.shortAnswer[0]).toMatchObject({
        question: 'Explain the main difference between supervised and unsupervised learning.',
        sampleAnswer: 'Supervised learning uses labeled training data to learn patterns, while unsupervised learning finds patterns in data without labels.',
        keyPoints: ['labeled data', 'pattern recognition', 'training process'],
        difficulty: 'medium'
      });
    });

    it('should generate essay questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: Analyze the impact of machine learning on modern society and discuss both its benefits and potential risks.
Guidelines: Consider various applications, ethical implications, and future developments in your analysis.
Key Themes: [societal impact, ethical considerations, technological advancement]
Length: 500-700 words
Section: Applications
Tags: society, ethics, impact, analysis`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['essay'],
        difficulty: 'hard',
        numQuestions: 10
      };

      const result = await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      expect(result.essay).toHaveLength(1);
      expect(result.essay[0]).toMatchObject({
        question: 'Analyze the impact of machine learning on modern society and discuss both its benefits and potential risks.',
        guidelines: 'Consider various applications, ethical implications, and future developments in your analysis.',
        keyThemes: ['societal impact', 'ethical considerations', 'technological advancement'],
        suggestedLength: '500-700 words',
        difficulty: 'hard'
      });
    });

    it('should generate mixed question types', async () => {
      const mockMCResponse = `QUESTION_1:
Question: What is machine learning?
A) A programming language
B) A subset of artificial intelligence
C) A database system
D) A web framework
Correct: B
Explanation: Machine learning is a subset of AI.
Section: What is Machine Learning?
Tags: AI, ML`;

      const mockFillResponse = `QUESTION_1:
Question: Machine learning is a ___ of artificial intelligence.
Answers: [subset]
Explanation: ML is a subset of AI.
Section: What is Machine Learning?
Tags: AI, ML`;

      (mockAIService.generateCompletion as jest.Mock)
        .mockResolvedValueOnce(mockMCResponse)
        .mockResolvedValueOnce(mockFillResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['multiple_choice', 'fill_in_blank'],
        difficulty: 'medium',
        numQuestions: 10
      };

      const result = await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      expect(result.multipleChoice).toHaveLength(1);
      expect(result.fillInBlank).toHaveLength(1);
      expect(result.totalGenerated).toBe(2);
    });

    it('should handle AI service errors gracefully', async () => {
      // Mock console.error to suppress expected error logs during testing
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      (mockAIService.generateCompletion as jest.Mock).mockRejectedValue(new Error('AI service error'));

      const options: QuestionGenerationOptions = {
        questionTypes: ['multiple_choice'],
        difficulty: 'medium',
        numQuestions: 5
      };

      await expect(pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options))
        .rejects.toThrow('Failed to generate questions');
      
      // Verify that error was logged
      expect(consoleSpy).toHaveBeenCalledWith('Error generating questions:', expect.any(Error));
      
      // Restore console.error
      consoleSpy.mockRestore();
    });

    it('should respect focus areas when provided', async () => {
      const mockResponse = `QUESTION_1:
Question: What is supervised learning?
A) Learning without labels
B) Learning with labeled data
C) Learning through trial and error
D) Learning from examples
Correct: B
Explanation: Supervised learning uses labeled training data.
Section: Types of Machine Learning
Tags: supervised, learning`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['multiple_choice'],
        difficulty: 'medium',
        numQuestions: 5,
        focusAreas: ['supervised learning', 'machine learning types']
      };

      await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      const callArgs = (mockAIService.generateCompletion as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toContain('supervised learning');
      expect(callArgs[1]).toContain('machine learning types');
    });
  });

  describe('question parsing', () => {
    it('should handle malformed responses gracefully', async () => {
      const malformedResponse = 'This is not a properly formatted response';

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(malformedResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['multiple_choice'],
        difficulty: 'medium',
        numQuestions: 5
      };

      const result = await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      expect(result.multipleChoice).toHaveLength(0);
      expect(result.totalGenerated).toBe(0);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should generate unique IDs for each question', async () => {
      const mockResponse = `QUESTION_1:
Question: What is machine learning?
A) A programming language
B) A subset of artificial intelligence
C) A database system
D) A web framework
Correct: B
Explanation: Machine learning is a subset of AI.
Section: What is Machine Learning?
Tags: AI, ML

QUESTION_2:
Question: What are the types of machine learning?
A) One type
B) Two types
C) Three main types
D) Four types
Correct: C
Explanation: There are three main types of machine learning.
Section: Types of Machine Learning
Tags: types, ML`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: QuestionGenerationOptions = {
        questionTypes: ['multiple_choice'],
        difficulty: 'medium',
        numQuestions: 5
      };

      const result = await pedagogyAgent.generateQuestions(mockStructuredText, mockKnowledgeElements, options);

      expect(result.multipleChoice).toHaveLength(2);
      expect(result.multipleChoice[0].id).toBeDefined();
      expect(result.multipleChoice[1].id).toBeDefined();
      expect(result.multipleChoice[0].id).not.toBe(result.multipleChoice[1].id);
    });
  });

  describe('generateFlashcards', () => {
    const mockDefinitionElement: KnowledgeElement = {
      document_id: 'doc-1',
      agent_type: 'extraction',
      element_type: 'definition',
      content: {
        title: 'Machine Learning',
        body: 'A subset of artificial intelligence that enables computers to learn from data without being explicitly programmed'
      },
      source_location: {
        section: 'Introduction',
        page: 1
      },
      created_at: new Date(),
      tags: ['AI', 'ML', 'definition']
    };

    const mockFormulaElement: KnowledgeElement = {
      document_id: 'doc-1',
      agent_type: 'extraction',
      element_type: 'formula',
      content: {
        title: 'Linear Regression',
        body: 'y = mx + b, where y is the dependent variable, x is the independent variable, m is the slope, and b is the y-intercept'
      },
      source_location: {
        section: 'Linear Models',
        page: 2
      },
      created_at: new Date(),
      tags: ['regression', 'formula', 'statistics']
    };

    const mockConceptElement: KnowledgeElement = {
      document_id: 'doc-1',
      agent_type: 'extraction',
      element_type: 'concept',
      content: {
        title: 'Overfitting',
        body: 'A modeling error that occurs when a model learns the training data too well, including noise and outliers, resulting in poor generalization to new data'
      },
      source_location: {
        section: 'Model Evaluation',
        page: 3
      },
      created_at: new Date(),
      tags: ['overfitting', 'model', 'evaluation']
    };

    it('should generate definition flashcards successfully', async () => {
      const mockResponse = `FLASHCARD_1:
Front: What is Machine Learning?
Back: A subset of artificial intelligence that enables computers to learn from data without being explicitly programmed
Type: definition
Section: Introduction
Tags: AI, ML, definition`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: FlashcardOptions = {
        includeDefinitions: true,
        includeFormulas: false,
        includeConcepts: false,
        difficulty: 'medium',
        spacedRepetition: false
      };

      const result = await pedagogyAgent.generateFlashcards([mockDefinitionElement], options);

      expect(result.flashcards).toHaveLength(1);
      expect(result.flashcards[0]).toMatchObject({
        front: 'What is Machine Learning?',
        back: 'A subset of artificial intelligence that enables computers to learn from data without being explicitly programmed',
        cardType: 'definition',
        difficulty: 'medium',
        sourceLocation: {
          section: 'Introduction'
        },
        tags: ['AI', 'ML', 'definition']
      });
      expect(result.totalGenerated).toBe(1);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should generate formula flashcards successfully', async () => {
      const mockResponse = `FLASHCARD_1:
Front: What is the formula for Linear Regression?
Back: y = mx + b, where y is the dependent variable, x is the independent variable, m is the slope, and b is the y-intercept
Type: formula
Section: Linear Models
Tags: regression, formula, statistics

FLASHCARD_2:
Front: When do you use Linear Regression?
Back: To model the relationship between a dependent variable and independent variables using a linear equation
Type: formula
Section: Linear Models
Tags: regression, formula, statistics`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: FlashcardOptions = {
        includeDefinitions: false,
        includeFormulas: true,
        includeConcepts: false,
        difficulty: 'hard',
        spacedRepetition: false
      };

      const result = await pedagogyAgent.generateFlashcards([mockFormulaElement], options);

      expect(result.flashcards).toHaveLength(2);
      expect(result.flashcards[0].cardType).toBe('formula');
      expect(result.flashcards[1].cardType).toBe('formula');
      expect(result.flashcards[0].difficulty).toBe('hard');
    });

    it('should generate concept flashcards successfully', async () => {
      const mockResponse = `FLASHCARD_1:
Front: What is overfitting in machine learning?
Back: A modeling error that occurs when a model learns the training data too well, including noise and outliers, resulting in poor generalization to new data
Type: concept
Section: Model Evaluation
Tags: overfitting, model, evaluation`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: FlashcardOptions = {
        includeDefinitions: false,
        includeFormulas: false,
        includeConcepts: true,
        difficulty: 'medium',
        spacedRepetition: false
      };

      const result = await pedagogyAgent.generateFlashcards([mockConceptElement], options);

      expect(result.flashcards).toHaveLength(1);
      expect(result.flashcards[0]).toMatchObject({
        front: 'What is overfitting in machine learning?',
        back: 'A modeling error that occurs when a model learns the training data too well, including noise and outliers, resulting in poor generalization to new data',
        cardType: 'concept',
        difficulty: 'medium'
      });
    });

    it('should add spaced repetition data when enabled', async () => {
      const mockResponse = `FLASHCARD_1:
Front: What is Machine Learning?
Back: A subset of artificial intelligence
Type: definition
Section: Introduction
Tags: AI, ML`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: FlashcardOptions = {
        includeDefinitions: true,
        includeFormulas: false,
        includeConcepts: false,
        difficulty: 'easy',
        spacedRepetition: true
      };

      const result = await pedagogyAgent.generateFlashcards([mockDefinitionElement], options);

      expect(result.flashcards[0].spacedRepetitionData).toBeDefined();
      expect(result.flashcards[0].spacedRepetitionData).toMatchObject({
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0
      });
      expect(result.flashcards[0].spacedRepetitionData!.nextReviewDate).toBeInstanceOf(Date);
    });

    it('should generate mixed flashcard types', async () => {
      const mockDefResponse = `FLASHCARD_1:
Front: What is Machine Learning?
Back: A subset of artificial intelligence
Type: definition
Section: Introduction
Tags: AI, ML`;

      const mockConceptResponse = `FLASHCARD_1:
Front: What is overfitting?
Back: When a model learns training data too well
Type: concept
Section: Model Evaluation
Tags: overfitting, model`;

      (mockAIService.generateCompletion as jest.Mock)
        .mockResolvedValueOnce(mockDefResponse)
        .mockResolvedValueOnce(mockConceptResponse);

      const options: FlashcardOptions = {
        includeDefinitions: true,
        includeFormulas: false,
        includeConcepts: true,
        difficulty: 'medium',
        spacedRepetition: false
      };

      const result = await pedagogyAgent.generateFlashcards(
        [mockDefinitionElement, mockConceptElement], 
        options
      );

      expect(result.flashcards).toHaveLength(2);
      expect(result.flashcards.find(card => card.cardType === 'definition')).toBeDefined();
      expect(result.flashcards.find(card => card.cardType === 'concept')).toBeDefined();
    });

    it('should handle empty knowledge elements', async () => {
      const options: FlashcardOptions = {
        includeDefinitions: true,
        includeFormulas: true,
        includeConcepts: true,
        difficulty: 'medium',
        spacedRepetition: false
      };

      const result = await pedagogyAgent.generateFlashcards([], options);

      expect(result.flashcards).toHaveLength(0);
      expect(result.totalGenerated).toBe(0);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should filter knowledge elements based on options', async () => {
      const mockResponse = `FLASHCARD_1:
Front: What is Machine Learning?
Back: A subset of artificial intelligence
Type: definition
Section: Introduction
Tags: AI, ML`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: FlashcardOptions = {
        includeDefinitions: true,
        includeFormulas: false, // Formula should be filtered out
        includeConcepts: false, // Concept should be filtered out
        difficulty: 'medium',
        spacedRepetition: false
      };

      const result = await pedagogyAgent.generateFlashcards(
        [mockDefinitionElement, mockFormulaElement, mockConceptElement], 
        options
      );

      // Should only generate flashcards for definitions
      expect(result.flashcards).toHaveLength(1);
      expect(result.flashcards[0].cardType).toBe('definition');
      expect(mockAIService.generateCompletion).toHaveBeenCalledTimes(1);
    });

    it('should handle AI service errors gracefully', async () => {
      // Mock console.error to suppress expected error logs during testing
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      (mockAIService.generateCompletion as jest.Mock).mockRejectedValue(new Error('AI service error'));

      const options: FlashcardOptions = {
        includeDefinitions: true,
        includeFormulas: false,
        includeConcepts: false,
        difficulty: 'medium',
        spacedRepetition: false
      };

      await expect(pedagogyAgent.generateFlashcards([mockDefinitionElement], options))
        .rejects.toThrow('Failed to generate flashcards');
      
      // Verify that error was logged
      expect(consoleSpy).toHaveBeenCalledWith('Error generating flashcards:', expect.any(Error));
      
      // Restore console.error
      consoleSpy.mockRestore();
    });

    it('should generate unique IDs for each flashcard', async () => {
      const mockResponse = `FLASHCARD_1:
Front: What is Machine Learning?
Back: A subset of artificial intelligence
Type: definition
Section: Introduction
Tags: AI, ML

FLASHCARD_2:
Front: Define AI
Back: Artificial Intelligence
Type: definition
Section: Introduction
Tags: AI`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: FlashcardOptions = {
        includeDefinitions: true,
        includeFormulas: false,
        includeConcepts: false,
        difficulty: 'medium',
        spacedRepetition: false
      };

      const result = await pedagogyAgent.generateFlashcards([mockDefinitionElement], options);

      expect(result.flashcards).toHaveLength(2);
      expect(result.flashcards[0].id).toBeDefined();
      expect(result.flashcards[1].id).toBeDefined();
      expect(result.flashcards[0].id).not.toBe(result.flashcards[1].id);
    });
  });

  describe('generateOpenEndedQuestions', () => {
    const mockThemeElement: KnowledgeElement = {
      document_id: 'doc-1',
      agent_type: 'analysis',
      element_type: 'theme',
      content: {
        title: 'Ethical AI',
        body: 'The importance of developing artificial intelligence systems that are fair, transparent, and beneficial to society'
      },
      source_location: {
        section: 'AI Ethics',
        page: 4
      },
      created_at: new Date(),
      tags: ['ethics', 'AI', 'society']
    };

    const mockArgumentElement: KnowledgeElement = {
      document_id: 'doc-1',
      agent_type: 'analysis',
      element_type: 'argument',
      content: {
        title: 'AI Bias Argument',
        body: 'AI systems can perpetuate and amplify existing biases present in training data, leading to unfair outcomes'
      },
      source_location: {
        section: 'AI Bias',
        page: 5
      },
      created_at: new Date(),
      tags: ['bias', 'fairness', 'AI']
    };

    it('should generate discussion questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: How can we ensure that AI systems are developed and deployed in an ethical manner?
Type: discussion
Complexity: intermediate
Guiding Points: [stakeholder involvement, transparency requirements, accountability measures]
Related Concepts: [ethical AI, transparency, accountability]
Section: AI Ethics
Tags: ethics, AI, discussion`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['discussion'],
        complexity: 'intermediate',
        numQuestions: 5
      };

      const result = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement], 
        options
      );

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toMatchObject({
        question: 'How can we ensure that AI systems are developed and deployed in an ethical manner?',
        questionType: 'discussion',
        complexity: 'intermediate',
        guidingPoints: ['stakeholder involvement', 'transparency requirements', 'accountability measures'],
        relatedConcepts: ['ethical AI', 'transparency', 'accountability'],
        sourceLocation: {
          section: 'AI Ethics'
        },
        tags: ['ethics', 'AI', 'discussion']
      });
      expect(result.totalGenerated).toBe(1);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should generate critical thinking questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: What assumptions underlie the belief that AI will always improve human decision-making?
Type: critical_thinking
Complexity: advanced
Guiding Points: [question assumptions, examine evidence, consider limitations]
Related Concepts: [AI limitations, human judgment, decision-making]
Section: AI Ethics
Tags: critical thinking, assumptions, AI`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['critical_thinking'],
        complexity: 'advanced',
        numQuestions: 4
      };

      const result = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockArgumentElement], 
        options
      );

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toMatchObject({
        question: 'What assumptions underlie the belief that AI will always improve human decision-making?',
        questionType: 'critical_thinking',
        complexity: 'advanced',
        guidingPoints: ['question assumptions', 'examine evidence', 'consider limitations'],
        relatedConcepts: ['AI limitations', 'human judgment', 'decision-making']
      });
    });

    it('should generate Socratic questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: How do you know when an AI system is making a biased decision?
Type: socratic
Complexity: intermediate
Guiding Points: [examine evidence, question sources, reflect on assumptions]
Related Concepts: [bias detection, evidence evaluation, critical thinking]
Section: AI Bias
Tags: socratic, bias, reflection`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['socratic'],
        complexity: 'intermediate',
        numQuestions: 4
      };

      const result = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockArgumentElement], 
        options
      );

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toMatchObject({
        question: 'How do you know when an AI system is making a biased decision?',
        questionType: 'socratic',
        complexity: 'intermediate',
        guidingPoints: ['examine evidence', 'question sources', 'reflect on assumptions'],
        relatedConcepts: ['bias detection', 'evidence evaluation', 'critical thinking']
      });
    });

    it('should generate analysis questions successfully', async () => {
      const mockResponse = `QUESTION_1:
Question: Compare and contrast the different approaches to addressing AI bias in machine learning systems.
Type: analysis
Complexity: advanced
Guiding Points: [identify approaches, compare effectiveness, evaluate trade-offs]
Related Concepts: [bias mitigation, algorithmic fairness, system design]
Section: AI Bias
Tags: analysis, comparison, bias mitigation`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['analysis'],
        complexity: 'advanced',
        numQuestions: 6
      };

      const result = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockArgumentElement], 
        options
      );

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toMatchObject({
        question: 'Compare and contrast the different approaches to addressing AI bias in machine learning systems.',
        questionType: 'analysis',
        complexity: 'advanced',
        guidingPoints: ['identify approaches', 'compare effectiveness', 'evaluate trade-offs'],
        relatedConcepts: ['bias mitigation', 'algorithmic fairness', 'system design']
      });
    });

    it('should generate mixed question types', async () => {
      const mockDiscussionResponse = `QUESTION_1:
Question: How should society regulate AI development?
Type: discussion
Complexity: intermediate
Guiding Points: [stakeholder perspectives, regulatory approaches, implementation challenges]
Related Concepts: [AI regulation, policy, governance]
Section: AI Ethics
Tags: discussion, regulation, policy`;

      const mockCriticalResponse = `QUESTION_1:
Question: What evidence supports the claim that AI bias is a significant problem?
Type: critical_thinking
Complexity: advanced
Guiding Points: [examine evidence, evaluate sources, consider counterarguments]
Related Concepts: [AI bias, evidence evaluation, critical analysis]
Section: AI Bias
Tags: critical thinking, evidence, bias`;

      (mockAIService.generateCompletion as jest.Mock)
        .mockResolvedValueOnce(mockDiscussionResponse)
        .mockResolvedValueOnce(mockCriticalResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['discussion', 'critical_thinking'],
        complexity: 'intermediate',
        numQuestions: 10
      };

      const result = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement, mockArgumentElement], 
        options
      );

      expect(result.questions).toHaveLength(2);
      expect(result.questions.find(q => q.questionType === 'discussion')).toBeDefined();
      expect(result.questions.find(q => q.questionType === 'critical_thinking')).toBeDefined();
    });

    it('should respect focus themes when provided', async () => {
      const mockResponse = `QUESTION_1:
Question: How can we ensure AI transparency in healthcare applications?
Type: discussion
Complexity: intermediate
Guiding Points: [transparency requirements, healthcare context, patient rights]
Related Concepts: [AI transparency, healthcare AI, patient safety]
Section: AI Ethics
Tags: discussion, transparency, healthcare`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['discussion'],
        complexity: 'intermediate',
        numQuestions: 5,
        focusThemes: ['AI transparency', 'healthcare applications']
      };

      await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement], 
        options
      );

      const callArgs = (mockAIService.generateCompletion as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toContain('AI transparency');
      expect(callArgs[1]).toContain('healthcare applications');
    });

    it('should handle AI service errors gracefully', async () => {
      // Mock console.error to suppress expected error logs during testing
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      (mockAIService.generateCompletion as jest.Mock).mockRejectedValue(new Error('AI service error'));

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['discussion'],
        complexity: 'intermediate',
        numQuestions: 5
      };

      await expect(pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement], 
        options
      )).rejects.toThrow('Failed to generate open-ended questions');
      
      // Verify that error was logged
      expect(consoleSpy).toHaveBeenCalledWith('Error generating open-ended questions:', expect.any(Error));
      
      // Restore console.error
      consoleSpy.mockRestore();
    });

    it('should handle malformed responses gracefully', async () => {
      const malformedResponse = 'This is not a properly formatted response';

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(malformedResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['discussion'],
        complexity: 'intermediate',
        numQuestions: 5
      };

      const result = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement], 
        options
      );

      expect(result.questions).toHaveLength(0);
      expect(result.totalGenerated).toBe(0);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should generate unique IDs for each question', async () => {
      const mockResponse = `QUESTION_1:
Question: How should we approach AI ethics?
Type: discussion
Complexity: intermediate
Guiding Points: [ethical frameworks, stakeholder input, implementation]
Related Concepts: [AI ethics, moral philosophy, technology governance]
Section: AI Ethics
Tags: ethics, discussion

QUESTION_2:
Question: What are the key challenges in AI governance?
Type: discussion
Complexity: intermediate
Guiding Points: [regulatory challenges, technical complexity, global coordination]
Related Concepts: [AI governance, regulation, policy]
Section: AI Ethics
Tags: governance, policy`;

      (mockAIService.generateCompletion as jest.Mock).mockResolvedValue(mockResponse);

      const options: OpenEndedQuestionOptions = {
        questionTypes: ['discussion'],
        complexity: 'intermediate',
        numQuestions: 5
      };

      const result = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement], 
        options
      );

      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].id).toBeDefined();
      expect(result.questions[1].id).toBeDefined();
      expect(result.questions[0].id).not.toBe(result.questions[1].id);
    });

    it('should adapt questions to content complexity', async () => {
      const mockBasicResponse = `QUESTION_1:
Question: What is AI and why is it important?
Type: discussion
Complexity: basic
Guiding Points: [define AI, identify benefits, discuss applications]
Related Concepts: [artificial intelligence, technology benefits, applications]
Section: Introduction
Tags: AI, basics, introduction`;

      const mockAdvancedResponse = `QUESTION_1:
Question: Critically evaluate the epistemological assumptions underlying current AI paradigms and their implications for knowledge representation.
Type: critical_thinking
Complexity: advanced
Guiding Points: [examine assumptions, evaluate paradigms, consider implications]
Related Concepts: [epistemology, AI paradigms, knowledge representation]
Section: AI Theory
Tags: epistemology, paradigms, advanced`;

      (mockAIService.generateCompletion as jest.Mock)
        .mockResolvedValueOnce(mockBasicResponse)
        .mockResolvedValueOnce(mockAdvancedResponse);

      // Test basic complexity
      const basicOptions: OpenEndedQuestionOptions = {
        questionTypes: ['discussion'],
        complexity: 'basic',
        numQuestions: 3
      };

      const basicResult = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement], 
        basicOptions
      );

      expect(basicResult.questions[0].complexity).toBe('basic');

      // Test advanced complexity
      const advancedOptions: OpenEndedQuestionOptions = {
        questionTypes: ['critical_thinking'],
        complexity: 'advanced',
        numQuestions: 3
      };

      const advancedResult = await pedagogyAgent.generateOpenEndedQuestions(
        mockStructuredText, 
        [mockThemeElement], 
        advancedOptions
      );

      expect(advancedResult.questions[0].complexity).toBe('advanced');
    });
  });
});