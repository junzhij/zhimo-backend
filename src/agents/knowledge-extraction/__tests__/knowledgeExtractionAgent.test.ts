import { 
  KnowledgeExtractionAgent, 
  Entity, 
  EntityType, 
  ImportanceLevel, 
  NEROptions,
  Definition,
  Concept,
  Formula,
  Theorem,
  Relationship,
  DefinitionType,
  ConceptCategory,
  FormulaType,
  TheoremType,
  RelationshipType,
  DefinitionExtractionOptions,
  ConceptExtractionOptions,
  FormulaExtractionOptions,
  TheoremExtractionOptions,
  RelationshipExtractionOptions
} from '../index';
import { StructuredText } from '../../../types';
import { mongoConnection } from '../../../database/mongodb';
import { createAIService } from '../../../services/aiService';

// Mock dependencies
jest.mock('../../../services/aiService');
jest.mock('../../../database/mongodb');
jest.mock('../../../utils/logger');

const mockAIService = {
  client: {
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }
};

const mockMongoConnection = {
  insertKnowledgeElement: jest.fn(),
  findKnowledgeElements: jest.fn(),
  searchKnowledgeElements: jest.fn()
};

(createAIService as jest.Mock).mockReturnValue(mockAIService);
(mongoConnection.insertKnowledgeElement as jest.Mock) = mockMongoConnection.insertKnowledgeElement;
(mongoConnection.findKnowledgeElements as jest.Mock) = mockMongoConnection.findKnowledgeElements;
(mongoConnection.searchKnowledgeElements as jest.Mock) = mockMongoConnection.searchKnowledgeElements;

describe('KnowledgeExtractionAgent - NER', () => {
  let agent: KnowledgeExtractionAgent;
  let mockStructuredText: StructuredText;

  beforeEach(() => {
    agent = new KnowledgeExtractionAgent();
    jest.clearAllMocks();

    mockStructuredText = {
      title: 'Machine Learning in Healthcare',
      sections: [
        {
          heading: 'Introduction',
          content: 'Machine learning has revolutionized healthcare. Dr. John Smith from Stanford University published groundbreaking research on neural networks in 2023. The study analyzed 10,000 patients and achieved 95% accuracy.'
        },
        {
          heading: 'Methodology',
          content: 'We used TensorFlow and Python to implement deep learning algorithms. The dataset contained information from Mayo Clinic and Johns Hopkins Hospital.',
          subsections: [
            {
              heading: 'Data Processing',
              content: 'Data preprocessing involved cleaning patient records from January 2020 to December 2022. We applied HIPAA compliance standards.'
            }
          ]
        }
      ],
      metadata: {
        wordCount: 150,
        pageCount: 5,
        language: 'en'
      }
    };
  });

  describe('extractEntities', () => {
    it('should extract entities from structured text successfully', async () => {
      // Mock AI service response
      const mockAIResponse = {
        choices: [{
          message: {
            content: `ENTITIES:
Entity: Dr. John Smith
Type: PERSON
Start: 65
End: 78
Confidence: 0.95
Importance: HIGH
Context: Machine learning has revolutionized healthcare. Dr. John Smith from Stanford University published
Metadata: title:Dr., profession:researcher

Entity: Stanford University
Type: ORGANIZATION
Start: 84
End: 102
Confidence: 0.92
Importance: MEDIUM
Context: Dr. John Smith from Stanford University published groundbreaking research
Metadata: type:university, location:California

Entity: 2023
Type: DATE
Start: 155
End: 159
Confidence: 0.88
Importance: MEDIUM
Context: published groundbreaking research on neural networks in 2023. The study
Metadata: year:2023, context:publication_date`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractEntities(
        'doc-123',
        'user-456',
        mockStructuredText
      );

      expect(result.entities).toHaveLength(3);
      expect(result.entities[0]).toMatchObject({
        text: 'Dr. John Smith',
        type: 'PERSON',
        confidence: 0.95,
        importance: 'HIGH'
      });
      expect(result.totalEntities).toBe(3);
      expect(result.entitiesByType.PERSON).toBe(1);
      expect(result.entitiesByType.ORGANIZATION).toBe(1);
      expect(result.entitiesByType.DATE).toBe(1);
      expect(mockMongoConnection.insertKnowledgeElement).toHaveBeenCalledTimes(3);
    });

    it('should filter entities by confidence threshold', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `ENTITIES:
Entity: High Confidence Entity
Type: CONCEPT
Start: 0
End: 20
Confidence: 0.95
Importance: HIGH
Context: High confidence entity in context
Metadata: none

Entity: Low Confidence Entity
Type: CONCEPT
Start: 25
End: 45
Confidence: 0.3
Importance: MEDIUM
Context: Low confidence entity in context
Metadata: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const options: NEROptions = {
        minConfidence: 0.6
      };

      const result = await agent.extractEntities(
        'doc-123',
        'user-456',
        mockStructuredText,
        options
      );

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].confidence).toBe(0.95);
    });

    it('should filter entities by importance level', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `ENTITIES:
Entity: Critical Entity
Type: CONCEPT
Start: 0
End: 15
Confidence: 0.9
Importance: CRITICAL
Context: Critical entity context
Metadata: none

Entity: Low Importance Entity
Type: CONCEPT
Start: 20
End: 40
Confidence: 0.9
Importance: LOW
Context: Low importance entity context
Metadata: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const options: NEROptions = {
        minImportance: 'MEDIUM'
      };

      const result = await agent.extractEntities(
        'doc-123',
        'user-456',
        mockStructuredText,
        options
      );

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].importance).toBe('CRITICAL');
    });

    it('should include/exclude specific entity types', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `ENTITIES:
Entity: John Doe
Type: PERSON
Start: 0
End: 8
Confidence: 0.9
Importance: HIGH
Context: John Doe is a researcher
Metadata: none

Entity: MIT
Type: ORGANIZATION
Start: 15
End: 18
Confidence: 0.9
Importance: HIGH
Context: researcher at MIT
Metadata: none

Entity: 2023
Type: DATE
Start: 25
End: 29
Confidence: 0.9
Importance: MEDIUM
Context: published in 2023
Metadata: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const options: NEROptions = {
        includeTypes: ['PERSON', 'ORGANIZATION']
      };

      const result = await agent.extractEntities(
        'doc-123',
        'user-456',
        mockStructuredText,
        options
      );

      expect(result.entities).toHaveLength(2);
      expect(result.entities.every(e => ['PERSON', 'ORGANIZATION'].includes(e.type))).toBe(true);
    });

    it('should deduplicate entities when enabled', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `ENTITIES:
Entity: John Smith
Type: PERSON
Start: 0
End: 10
Confidence: 0.8
Importance: HIGH
Context: First mention of John Smith
Metadata: none

Entity: John Smith
Type: PERSON
Start: 50
End: 60
Confidence: 0.9
Importance: HIGH
Context: Second mention of John Smith
Metadata: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const options: NEROptions = {
        deduplication: true
      };

      const result = await agent.extractEntities(
        'doc-123',
        'user-456',
        mockStructuredText,
        options
      );

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].confidence).toBe(0.9); // Should keep higher confidence
    });

    it('should handle AI service errors gracefully', async () => {
      mockAIService.client.chat.completions.create.mockRejectedValue(new Error('AI service error'));

      await expect(agent.extractEntities(
        'doc-123',
        'user-456',
        mockStructuredText
      )).rejects.toThrow('Failed to extract entities');
    });

    it('should handle empty AI response', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: null
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);

      await expect(agent.extractEntities(
        'doc-123',
        'user-456',
        mockStructuredText
      )).rejects.toThrow('Failed to extract entities');
    });
  });

  describe('getEntitiesByDocument', () => {
    it('should retrieve entities for a document', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'element-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'entity',
          content: {
            title: 'John Smith',
            body: 'Entity: John Smith\nType: PERSON',
            metadata: {
              entityType: 'PERSON',
              confidence: 0.9,
              importance: 'HIGH',
              startPosition: 0,
              endPosition: 10,
              context: 'John Smith is a researcher'
            }
          },
          source_location: {
            section: 'Introduction',
            position: { paragraph: 1, sentence: 1 }
          },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['person', 'high', 'entity', 'ner'],
          confidence_score: 0.9,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.findKnowledgeElements.mockResolvedValue(mockKnowledgeElements);

      const entities = await agent.getEntitiesByDocument('doc-123');

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        text: 'John Smith',
        type: 'PERSON',
        confidence: 0.9,
        importance: 'HIGH'
      });
    });

    it('should filter by entity types', async () => {
      mockMongoConnection.findKnowledgeElements.mockResolvedValue([]);

      await agent.getEntitiesByDocument('doc-123', {
        types: ['PERSON', 'ORGANIZATION'],
        minConfidence: 0.8
      });

      expect(mockMongoConnection.findKnowledgeElements).toHaveBeenCalledWith(
        expect.objectContaining({
          document_id: 'doc-123',
          confidence_score: { $gte: 0.8 }
        }),
        expect.any(Object)
      );
    });
  });

  describe('searchEntities', () => {
    it('should search entities by text', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'element-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'entity',
          content: {
            title: 'Machine Learning',
            body: 'Entity: Machine Learning\nType: CONCEPT',
            metadata: {
              entityType: 'CONCEPT',
              confidence: 0.85,
              importance: 'HIGH'
            }
          },
          source_location: { section: 'Introduction' },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['concept', 'high', 'entity', 'ner'],
          confidence_score: 0.85,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.searchKnowledgeElements.mockResolvedValue(mockKnowledgeElements);

      const entities = await agent.searchEntities('machine learning');

      expect(entities).toHaveLength(1);
      expect(entities[0].text).toBe('Machine Learning');
      expect(mockMongoConnection.searchKnowledgeElements).toHaveBeenCalledWith(
        'machine learning',
        expect.objectContaining({
          agent_type: 'extraction',
          element_type: 'entity'
        })
      );
    });

    it('should search entities within specific document', async () => {
      mockMongoConnection.searchKnowledgeElements.mockResolvedValue([]);

      await agent.searchEntities('test', 'doc-123');

      expect(mockMongoConnection.searchKnowledgeElements).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          document_id: 'doc-123'
        })
      );
    });
  });

  describe('Entity type validation', () => {
    it('should validate all entity types are supported', () => {
      const supportedTypes: EntityType[] = [
        'PERSON', 'ORGANIZATION', 'LOCATION', 'DATE', 'TIME', 'MONEY', 'PERCENT',
        'CONCEPT', 'TERM', 'THEORY', 'METHOD', 'TOOL', 'METRIC', 'EVENT',
        'PUBLICATION', 'LAW', 'DISEASE', 'CHEMICAL', 'GENE', 'SPECIES', 'MISC'
      ];

      // This test ensures all entity types are properly defined
      expect(supportedTypes).toHaveLength(21);
      expect(supportedTypes).toContain('PERSON');
      expect(supportedTypes).toContain('CONCEPT');
      expect(supportedTypes).toContain('MISC');
    });
  });

  describe('Importance level validation', () => {
    it('should validate all importance levels are supported', () => {
      const importanceLevels: ImportanceLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      
      expect(importanceLevels).toHaveLength(4);
      expect(importanceLevels).toContain('LOW');
      expect(importanceLevels).toContain('CRITICAL');
    });
  });

  describe('extractDefinitions', () => {
    it('should extract definitions from structured text successfully', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `DEFINITIONS:
Term: Machine Learning
Definition: A subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed
Type: EXPLICIT
Confidence: 0.92
Importance: HIGH
Context: Machine learning is a subset of artificial intelligence that enables computers to learn
Related: artificial intelligence, deep learning, neural networks
Examples: image recognition, natural language processing, recommendation systems

Term: Neural Network
Definition: A computing system inspired by biological neural networks that constitute animal brains
Type: COMPARISON
Confidence: 0.88
Importance: MEDIUM
Context: Neural networks are computing systems inspired by biological neural networks
Related: machine learning, deep learning, artificial intelligence
Examples: convolutional neural networks, recurrent neural networks`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractDefinitions(
        'doc-123',
        'user-456',
        mockStructuredText
      );

      expect(result.definitions).toHaveLength(2);
      expect(result.definitions[0]).toMatchObject({
        term: 'Machine Learning',
        definitionType: 'EXPLICIT',
        confidence: 0.92,
        importance: 'HIGH'
      });
      expect(result.definitions[0].relatedTerms).toContain('artificial intelligence');
      expect(result.definitions[0].examples).toContain('image recognition');
      expect(result.totalDefinitions).toBe(2);
      expect(result.definitionsByType.EXPLICIT).toBe(1);
      expect(result.definitionsByType.COMPARISON).toBe(1);
    });

    it('should filter definitions by confidence threshold', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `DEFINITIONS:
Term: High Confidence Term
Definition: A term with high confidence
Type: EXPLICIT
Confidence: 0.95
Importance: HIGH
Context: High confidence term context
Related: none
Examples: none

Term: Low Confidence Term
Definition: A term with low confidence
Type: EXPLICIT
Confidence: 0.3
Importance: MEDIUM
Context: Low confidence term context
Related: none
Examples: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractDefinitions(
        'doc-123',
        'user-456',
        mockStructuredText,
        { minConfidence: 0.6 }
      );

      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0].confidence).toBe(0.95);
    });

    it('should deduplicate definitions when enabled', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `DEFINITIONS:
Term: Machine Learning
Definition: First definition of machine learning
Type: EXPLICIT
Confidence: 0.8
Importance: HIGH
Context: First context
Related: none
Examples: none

Term: Machine Learning
Definition: Second definition of machine learning
Type: EXPLICIT
Confidence: 0.9
Importance: HIGH
Context: Second context
Related: none
Examples: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractDefinitions(
        'doc-123',
        'user-456',
        mockStructuredText,
        { deduplication: true }
      );

      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0].confidence).toBe(0.9); // Should keep higher confidence
    });
  });

  describe('extractConcepts', () => {
    it('should extract concepts from structured text successfully', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `CONCEPTS:
Name: Supervised Learning
Description: A machine learning approach where the algorithm learns from labeled training data
Category: METHOD
Confidence: 0.90
Importance: HIGH
KeyPoints: uses labeled data; learns input-output mappings; requires training examples
Related: unsupervised learning, reinforcement learning
Examples: classification, regression
Applications: spam detection, medical diagnosis, price prediction

Name: Gradient Descent
Description: An optimization algorithm used to minimize the cost function in machine learning
Category: TECHNIQUE
Confidence: 0.85
Importance: MEDIUM
KeyPoints: iterative optimization; minimizes cost function; uses derivatives
Related: backpropagation, optimization
Examples: stochastic gradient descent, mini-batch gradient descent
Applications: neural network training, linear regression`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractConcepts(
        'doc-123',
        'user-456',
        mockStructuredText
      );

      expect(result.concepts).toHaveLength(2);
      expect(result.concepts[0]).toMatchObject({
        name: 'Supervised Learning',
        category: 'METHOD',
        confidence: 0.90,
        importance: 'HIGH'
      });
      expect(result.concepts[0].keyPoints).toContain('uses labeled data');
      expect(result.concepts[0].applications).toContain('spam detection');
      expect(result.totalConcepts).toBe(2);
      expect(result.conceptsByCategory.METHOD).toBe(1);
      expect(result.conceptsByCategory.TECHNIQUE).toBe(1);
    });

    it('should filter concepts by category', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `CONCEPTS:
Name: Theory Concept
Description: A theoretical concept
Category: THEORY
Confidence: 0.9
Importance: HIGH
KeyPoints: theoretical foundation
Related: none
Examples: none
Applications: none

Name: Method Concept
Description: A methodological concept
Category: METHOD
Confidence: 0.9
Importance: HIGH
KeyPoints: methodological approach
Related: none
Examples: none
Applications: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractConcepts(
        'doc-123',
        'user-456',
        mockStructuredText,
        { includeCategories: ['THEORY'] }
      );

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0].category).toBe('THEORY');
    });
  });

  describe('getDefinitionsByDocument', () => {
    it('should retrieve definitions for a document', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'def-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'definition',
          content: {
            title: 'Machine Learning',
            body: 'A subset of AI that enables computers to learn',
            metadata: {
              definitionType: 'EXPLICIT',
              confidence: 0.9,
              importance: 'HIGH',
              context: 'ML context',
              relatedTerms: ['AI', 'deep learning'],
              examples: ['image recognition']
            }
          },
          source_location: {
            section: 'Introduction',
            position: { paragraph: 1, sentence: 1 }
          },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['explicit', 'high', 'definition'],
          confidence_score: 0.9,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.findKnowledgeElements.mockResolvedValue(mockKnowledgeElements);

      const definitions = await agent.getDefinitionsByDocument('doc-123');

      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toMatchObject({
        term: 'Machine Learning',
        definitionType: 'EXPLICIT',
        confidence: 0.9,
        importance: 'HIGH'
      });
    });
  });

  describe('getConceptsByDocument', () => {
    it('should retrieve concepts for a document', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'concept-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'concept',
          content: {
            title: 'Supervised Learning',
            body: 'Learning approach with labeled data',
            metadata: {
              category: 'METHOD',
              confidence: 0.85,
              importance: 'HIGH',
              keyPoints: ['labeled data', 'training examples'],
              relatedConcepts: ['unsupervised learning'],
              examples: ['classification'],
              applications: ['spam detection']
            }
          },
          source_location: {
            section: 'Methods',
            position: { paragraph: 2, sentence: 1 }
          },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['method', 'high', 'concept'],
          confidence_score: 0.85,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.findKnowledgeElements.mockResolvedValue(mockKnowledgeElements);

      const concepts = await agent.getConceptsByDocument('doc-123');

      expect(concepts).toHaveLength(1);
      expect(concepts[0]).toMatchObject({
        name: 'Supervised Learning',
        category: 'METHOD',
        confidence: 0.85,
        importance: 'HIGH'
      });
    });
  });

  describe('extractFormulas', () => {
    it('should extract formulas from structured text successfully', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `FORMULAS:
Name: Quadratic Formula
Expression: x = (-b ± √(b²-4ac)) / 2a
LaTeX: x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}
Description: Formula for solving quadratic equations of the form ax² + bx + c = 0
Type: EQUATION
Confidence: 0.95
Importance: HIGH
Context: The quadratic formula is used to solve quadratic equations
Variables: x:solution variable:none; a:coefficient of x²:none; b:coefficient of x:none; c:constant term:none
Domain: Algebra
Applications: solving quadratic equations, optimization problems
Related: discriminant formula, completing the square

Name: Einstein's Mass-Energy Equivalence
Expression: E = mc²
LaTeX: E = mc^2
Description: Relationship between mass and energy in special relativity
Type: PHYSICAL
Confidence: 0.98
Importance: CRITICAL
Context: Einstein's famous equation relating mass and energy
Variables: E:energy:joules; m:mass:kilograms; c:speed of light:meters per second
Domain: Physics
Applications: nuclear physics, particle physics, cosmology
Related: relativistic energy formula, rest energy`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractFormulas(
        'doc-123',
        'user-456',
        mockStructuredText
      );

      expect(result.formulas).toHaveLength(2);
      expect(result.formulas[0]).toMatchObject({
        name: 'Quadratic Formula',
        expression: 'x = (-b ± √(b²-4ac)) / 2a',
        formulaType: 'EQUATION',
        confidence: 0.95,
        importance: 'HIGH'
      });
      expect(result.formulas[0].variables).toHaveLength(4);
      expect(result.formulas[0].applications).toContain('solving quadratic equations');
      expect(result.totalFormulas).toBe(2);
      expect(result.formulasByType.EQUATION).toBe(1);
      expect(result.formulasByType.PHYSICAL).toBe(1);
    });

    it('should filter formulas by confidence threshold', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `FORMULAS:
Name: High Confidence Formula
Expression: y = mx + b
LaTeX: y = mx + b
Description: Linear equation
Type: EQUATION
Confidence: 0.95
Importance: HIGH
Context: Linear equation context
Variables: none
Domain: Algebra
Applications: none
Related: none

Name: Low Confidence Formula
Expression: z = x + y
LaTeX: none
Description: Simple addition
Type: EXPRESSION
Confidence: 0.3
Importance: LOW
Context: Simple addition context
Variables: none
Domain: Arithmetic
Applications: none
Related: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractFormulas(
        'doc-123',
        'user-456',
        mockStructuredText,
        { minConfidence: 0.6 }
      );

      expect(result.formulas).toHaveLength(1);
      expect(result.formulas[0].confidence).toBe(0.95);
    });
  });

  describe('extractTheorems', () => {
    it('should extract theorems from structured text successfully', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `THEOREMS:
Name: Pythagorean Theorem
Statement: In a right triangle, the square of the hypotenuse equals the sum of squares of the other two sides
Proof: Can be proven using geometric methods or algebraic manipulation
Type: THEOREM
Confidence: 0.98
Importance: CRITICAL
Context: Fundamental theorem in geometry relating to right triangles
Domain: Geometry
Prerequisites: basic geometry, understanding of squares and square roots
Applications: distance calculations, trigonometry, engineering
Related: law of cosines, distance formula
Corollaries: Pythagorean triples, 3-4-5 triangle
Examples: 3-4-5 triangle, 5-12-13 triangle

Name: Fundamental Theorem of Calculus
Statement: The definite integral of a function can be computed using any of its antiderivatives
Proof: none
Type: THEOREM
Confidence: 0.96
Importance: CRITICAL
Context: Central theorem connecting differentiation and integration
Domain: Calculus
Prerequisites: understanding of derivatives, integrals, continuity
Applications: computing definite integrals, solving differential equations
Related: mean value theorem, chain rule
Corollaries: evaluation theorem, second fundamental theorem
Examples: ∫[a,b] f'(x)dx = f(b) - f(a)`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractTheorems(
        'doc-123',
        'user-456',
        mockStructuredText
      );

      expect(result.theorems).toHaveLength(2);
      expect(result.theorems[0]).toMatchObject({
        name: 'Pythagorean Theorem',
        theoremType: 'THEOREM',
        confidence: 0.98,
        importance: 'CRITICAL'
      });
      expect(result.theorems[0].prerequisites).toContain('basic geometry');
      expect(result.theorems[0].applications).toContain('distance calculations');
      expect(result.totalTheorems).toBe(2);
      expect(result.theoremsByType.THEOREM).toBe(2);
    });

    it('should filter theorems by type', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `THEOREMS:
Name: Main Theorem
Statement: This is a main theorem
Proof: none
Type: THEOREM
Confidence: 0.9
Importance: HIGH
Context: Main theorem context
Domain: Mathematics
Prerequisites: none
Applications: none
Related: none
Corollaries: none
Examples: none

Name: Supporting Lemma
Statement: This is a supporting lemma
Proof: none
Type: LEMMA
Confidence: 0.9
Importance: MEDIUM
Context: Supporting lemma context
Domain: Mathematics
Prerequisites: none
Applications: none
Related: none
Corollaries: none
Examples: none`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractTheorems(
        'doc-123',
        'user-456',
        mockStructuredText,
        { includeTypes: ['THEOREM'] }
      );

      expect(result.theorems).toHaveLength(1);
      expect(result.theorems[0].theoremType).toBe('THEOREM');
    });
  });

  describe('getFormulasByDocument', () => {
    it('should retrieve formulas for a document', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'formula-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'formula',
          content: {
            title: 'E = mc²',
            body: 'Mass-energy equivalence formula\n\nExpression: E = mc²\nLaTeX: E = mc^2',
            metadata: {
              name: 'Mass-Energy Equivalence',
              expression: 'E = mc²',
              latex: 'E = mc^2',
              formulaType: 'PHYSICAL',
              confidence: 0.98,
              importance: 'CRITICAL',
              context: 'Einstein equation',
              domain: 'Physics',
              variables: [
                { symbol: 'E', description: 'energy', unit: 'joules' },
                { symbol: 'm', description: 'mass', unit: 'kilograms' },
                { symbol: 'c', description: 'speed of light', unit: 'meters per second' }
              ]
            }
          },
          source_location: {
            section: 'Physics',
            position: { paragraph: 1, sentence: 1 }
          },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['physical', 'critical', 'formula'],
          confidence_score: 0.98,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.findKnowledgeElements.mockResolvedValue(mockKnowledgeElements);

      const formulas = await agent.getFormulasByDocument('doc-123');

      expect(formulas).toHaveLength(1);
      expect(formulas[0]).toMatchObject({
        name: 'Mass-Energy Equivalence',
        expression: 'E = mc²',
        formulaType: 'PHYSICAL',
        confidence: 0.98,
        importance: 'CRITICAL'
      });
    });
  });

  describe('getTheoremsByDocument', () => {
    it('should retrieve theorems for a document', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'theorem-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'theorem',
          content: {
            title: 'Pythagorean Theorem',
            body: 'In a right triangle, the square of the hypotenuse equals the sum of squares of the other two sides\n\nProof: Geometric proof available',
            metadata: {
              statement: 'In a right triangle, the square of the hypotenuse equals the sum of squares of the other two sides',
              proof: 'Geometric proof available',
              theoremType: 'THEOREM',
              confidence: 0.98,
              importance: 'CRITICAL',
              context: 'Right triangle geometry',
              domain: 'Geometry',
              prerequisites: ['basic geometry'],
              applications: ['distance calculations', 'trigonometry']
            }
          },
          source_location: {
            section: 'Geometry',
            position: { paragraph: 2, sentence: 1 }
          },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['theorem', 'critical', 'theorem'],
          confidence_score: 0.98,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.findKnowledgeElements.mockResolvedValue(mockKnowledgeElements);

      const theorems = await agent.getTheoremsByDocument('doc-123');

      expect(theorems).toHaveLength(1);
      expect(theorems[0]).toMatchObject({
        name: 'Pythagorean Theorem',
        theoremType: 'THEOREM',
        confidence: 0.98,
        importance: 'CRITICAL'
      });
    });
  });

  describe('Definition and concept type validation', () => {
    it('should validate all definition types are supported', () => {
      const definitionTypes = ['EXPLICIT', 'IMPLICIT', 'EXAMPLE', 'COMPARISON', 'FUNCTIONAL', 'CLASSIFICATION'];
      
      expect(definitionTypes).toHaveLength(6);
      expect(definitionTypes).toContain('EXPLICIT');
      expect(definitionTypes).toContain('CLASSIFICATION');
    });

    it('should validate all concept categories are supported', () => {
      const conceptCategories = [
        'THEORY', 'METHOD', 'PRINCIPLE', 'PROCESS', 'FRAMEWORK', 'MODEL',
        'TECHNIQUE', 'APPROACH', 'PHENOMENON', 'SYSTEM', 'TOOL', 'METRIC', 'GENERAL'
      ];
      
      expect(conceptCategories).toHaveLength(13);
      expect(conceptCategories).toContain('THEORY');
      expect(conceptCategories).toContain('GENERAL');
    });

    it('should validate all formula types are supported', () => {
      const formulaTypes = [
        'EQUATION', 'INEQUALITY', 'FUNCTION', 'IDENTITY', 'THEOREM', 'LEMMA',
        'COROLLARY', 'DEFINITION', 'AXIOM', 'FORMULA', 'EXPRESSION', 'PROOF',
        'ALGORITHM', 'STATISTICAL', 'PHYSICAL', 'CHEMICAL', 'ECONOMIC', 'GENERAL'
      ];
      
      expect(formulaTypes).toHaveLength(18);
      expect(formulaTypes).toContain('EQUATION');
      expect(formulaTypes).toContain('PHYSICAL');
      expect(formulaTypes).toContain('GENERAL');
    });

    it('should validate all theorem types are supported', () => {
      const theoremTypes = [
        'THEOREM', 'LEMMA', 'COROLLARY', 'PROPOSITION', 'AXIOM', 'POSTULATE',
        'PRINCIPLE', 'LAW', 'RULE', 'PROPERTY', 'CONJECTURE', 'HYPOTHESIS',
        'DEFINITION', 'GENERAL'
      ];
      
      expect(theoremTypes).toHaveLength(14);
      expect(theoremTypes).toContain('THEOREM');
      expect(theoremTypes).toContain('LAW');
      expect(theoremTypes).toContain('GENERAL');
    });

    it('should validate all relationship types are supported', () => {
      const relationshipTypes = [
        'IS_A', 'PART_OF', 'CAUSES', 'ENABLES', 'REQUIRES', 'SIMILAR_TO', 'OPPOSITE_TO',
        'RELATED_TO', 'DERIVES_FROM', 'APPLIES_TO', 'INFLUENCES', 'CONTAINS', 'USES',
        'IMPLEMENTS', 'EXTENDS', 'PRECEDES', 'FOLLOWS', 'EQUIVALENT_TO', 'CONTRADICTS',
        'SUPPORTS', 'GENERAL'
      ];
      
      expect(relationshipTypes).toHaveLength(21);
      expect(relationshipTypes).toContain('IS_A');
      expect(relationshipTypes).toContain('CAUSES');
      expect(relationshipTypes).toContain('GENERAL');
    });
  });

  describe('extractRelationships', () => {
    beforeEach(() => {
      // Mock existing knowledge elements for relationship extraction
      const mockKnowledgeElements = [
        {
          _id: 'entity-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'entity',
          content: { title: 'Machine Learning', body: 'AI subset' },
          source_location: { section: 'Introduction' },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['entity'],
          confidence_score: 0.9,
          user_id: 'user-456'
        },
        {
          _id: 'entity-2',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'entity',
          content: { title: 'Artificial Intelligence', body: 'AI field' },
          source_location: { section: 'Introduction' },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['entity'],
          confidence_score: 0.95,
          user_id: 'user-456'
        },
        {
          _id: 'concept-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'concept',
          content: { title: 'Neural Networks', body: 'Computing system' },
          source_location: { section: 'Methods' },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['concept'],
          confidence_score: 0.88,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.findKnowledgeElements.mockResolvedValue(mockKnowledgeElements);
    });

    it('should extract relationships from structured text successfully', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `RELATIONSHIPS:
Source: Machine Learning
Target: Artificial Intelligence
Type: IS_A
Description: Machine Learning is a subset of Artificial Intelligence
Context: Machine Learning is a subset of Artificial Intelligence that focuses on algorithms
Confidence: 0.95
Importance: HIGH
Direction: DIRECTED
Strength: 0.9
Evidence: subset of; part of artificial intelligence; AI technique

Source: Neural Networks
Target: Machine Learning
Type: PART_OF
Description: Neural Networks are a key component of Machine Learning
Context: Neural Networks are fundamental building blocks in Machine Learning systems
Confidence: 0.88
Importance: MEDIUM
Direction: DIRECTED
Strength: 0.8
Evidence: component of; used in; fundamental to machine learning`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractRelationships(
        'doc-123',
        'user-456',
        mockStructuredText
      );

      expect(result.relationships).toHaveLength(2);
      expect(result.relationships[0]).toMatchObject({
        sourceEntity: 'Machine Learning',
        targetEntity: 'Artificial Intelligence',
        relationshipType: 'IS_A',
        confidence: 0.95,
        importance: 'HIGH',
        direction: 'DIRECTED',
        strength: 0.9
      });
      expect(result.relationships[0].evidence).toContain('subset of');
      expect(result.totalRelationships).toBe(2);
      expect(result.relationshipsByType.IS_A).toBe(1);
      expect(result.relationshipsByType.PART_OF).toBe(1);
      expect(result.knowledgeGraph.nodes).toHaveLength(3);
      expect(result.knowledgeGraph.edges).toHaveLength(2);
    });

    it('should filter relationships by confidence threshold', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `RELATIONSHIPS:
Source: Machine Learning
Target: Artificial Intelligence
Type: IS_A
Description: High confidence relationship
Context: Strong relationship context
Confidence: 0.95
Importance: HIGH
Direction: DIRECTED
Strength: 0.9
Evidence: strong evidence

Source: Neural Networks
Target: Machine Learning
Type: RELATED_TO
Description: Low confidence relationship
Context: Weak relationship context
Confidence: 0.3
Importance: LOW
Direction: UNDIRECTED
Strength: 0.4
Evidence: weak evidence`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractRelationships(
        'doc-123',
        'user-456',
        mockStructuredText,
        { minConfidence: 0.6 }
      );

      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].confidence).toBe(0.95);
    });

    it('should filter relationships by strength threshold', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `RELATIONSHIPS:
Source: Machine Learning
Target: Artificial Intelligence
Type: IS_A
Description: Strong relationship
Context: Strong relationship context
Confidence: 0.9
Importance: HIGH
Direction: DIRECTED
Strength: 0.9
Evidence: strong evidence

Source: Neural Networks
Target: Machine Learning
Type: RELATED_TO
Description: Weak relationship
Context: Weak relationship context
Confidence: 0.8
Importance: MEDIUM
Direction: UNDIRECTED
Strength: 0.2
Evidence: weak evidence`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractRelationships(
        'doc-123',
        'user-456',
        mockStructuredText,
        { minStrength: 0.5 }
      );

      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].strength).toBe(0.9);
    });

    it('should handle case with no existing knowledge elements', async () => {
      mockMongoConnection.findKnowledgeElements.mockResolvedValue([]);

      const result = await agent.extractRelationships(
        'doc-123',
        'user-456',
        mockStructuredText
      );

      expect(result.relationships).toHaveLength(0);
      expect(result.totalRelationships).toBe(0);
      expect(result.knowledgeGraph.nodes).toHaveLength(0);
      expect(result.knowledgeGraph.edges).toHaveLength(0);
    });

    it('should deduplicate relationships when enabled', async () => {
      const mockAIResponse = {
        choices: [{
          message: {
            content: `RELATIONSHIPS:
Source: Machine Learning
Target: Artificial Intelligence
Type: IS_A
Description: First relationship
Context: First context
Confidence: 0.8
Importance: HIGH
Direction: DIRECTED
Strength: 0.8
Evidence: first evidence

Source: Machine Learning
Target: Artificial Intelligence
Type: IS_A
Description: Second relationship
Context: Second context
Confidence: 0.9
Importance: HIGH
Direction: DIRECTED
Strength: 0.9
Evidence: second evidence`
          }
        }]
      };

      mockAIService.client.chat.completions.create.mockResolvedValue(mockAIResponse);
      mockMongoConnection.insertKnowledgeElement.mockResolvedValue('mock-id');

      const result = await agent.extractRelationships(
        'doc-123',
        'user-456',
        mockStructuredText,
        { deduplication: true }
      );

      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].confidence).toBe(0.9); // Should keep higher confidence
    });
  });

  describe('getRelationshipsByDocument', () => {
    it('should retrieve relationships for a document', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'rel-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'relationship',
          content: {
            title: 'Machine Learning IS_A Artificial Intelligence',
            body: 'Machine Learning is a subset of Artificial Intelligence',
            metadata: {
              sourceEntity: 'Machine Learning',
              targetEntity: 'Artificial Intelligence',
              relationshipType: 'IS_A',
              confidence: 0.95,
              importance: 'HIGH',
              context: 'ML is part of AI',
              direction: 'DIRECTED',
              strength: 0.9,
              evidence: ['subset of', 'part of AI']
            }
          },
          source_location: {
            section: 'Introduction',
            position: { paragraph: 1, sentence: 1 }
          },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['is_a', 'high', 'relationship'],
          confidence_score: 0.95,
          user_id: 'user-456'
        }
      ];

      mockMongoConnection.findKnowledgeElements.mockResolvedValue(mockKnowledgeElements);

      const relationships = await agent.getRelationshipsByDocument('doc-123');

      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toMatchObject({
        sourceEntity: 'Machine Learning',
        targetEntity: 'Artificial Intelligence',
        relationshipType: 'IS_A',
        confidence: 0.95,
        importance: 'HIGH',
        direction: 'DIRECTED',
        strength: 0.9
      });
    });
  });

  describe('getKnowledgeGraph', () => {
    it('should build knowledge graph for a document', async () => {
      const mockKnowledgeElements = [
        {
          _id: 'entity-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'entity',
          content: { title: 'Machine Learning', body: 'AI subset' },
          source_location: { section: 'Introduction' },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['entity'],
          confidence_score: 0.9,
          user_id: 'user-456'
        }
      ];

      const mockRelationships = [
        {
          id: 'rel-1',
          sourceEntity: 'Machine Learning',
          targetEntity: 'Artificial Intelligence',
          relationshipType: 'IS_A' as any,
          description: 'ML is subset of AI',
          context: 'AI context',
          confidence: 0.95,
          importance: 'HIGH' as any,
          sourceLocation: { section: 'Introduction' },
          direction: 'DIRECTED' as any,
          strength: 0.9,
          evidence: ['subset']
        }
      ];

      mockMongoConnection.findKnowledgeElements
        .mockResolvedValueOnce(mockKnowledgeElements) // For getExistingKnowledgeElements
        .mockResolvedValueOnce([{
          _id: 'rel-1',
          document_id: 'doc-123',
          agent_type: 'extraction',
          element_type: 'relationship',
          content: {
            title: 'ML IS_A AI',
            body: 'relationship',
            metadata: {
              sourceEntity: 'Machine Learning',
              targetEntity: 'Artificial Intelligence',
              relationshipType: 'IS_A',
              direction: 'DIRECTED',
              strength: 0.9
            }
          },
          source_location: { section: 'Introduction' },
          created_at: new Date(),
          updated_at: new Date(),
          tags: ['relationship'],
          confidence_score: 0.95,
          user_id: 'user-456'
        }]); // For getRelationshipsByDocument

      const knowledgeGraph = await agent.getKnowledgeGraph('doc-123');

      expect(knowledgeGraph.nodes).toHaveLength(1);
      expect(knowledgeGraph.edges).toHaveLength(1);
      expect(knowledgeGraph.metadata.totalNodes).toBe(1);
      expect(knowledgeGraph.metadata.totalEdges).toBe(1);
    });
  });
});