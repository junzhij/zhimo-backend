import { AIService, createAIService } from '../../services/aiService';
import { mongoConnection, KnowledgeElement } from '../../database/mongodb';
import { StructuredText } from '../../types';
import { Logger } from '../../utils/logger';

// Entity types for NER
export interface Entity {
  id: string;
  text: string;
  type: EntityType;
  startPosition: number;
  endPosition: number;
  confidence: number;
  importance: ImportanceLevel;
  context: string;
  sourceLocation: {
    section: string;
    paragraph?: number;
    sentence?: number;
  };
  metadata?: Record<string, any>;
}

export type EntityType = 
  | 'PERSON'           // Names of people
  | 'ORGANIZATION'     // Companies, institutions
  | 'LOCATION'         // Places, geographical entities
  | 'DATE'             // Dates and time expressions
  | 'TIME'             // Time expressions
  | 'MONEY'            // Monetary values
  | 'PERCENT'          // Percentages
  | 'CONCEPT'          // Academic concepts
  | 'TERM'             // Technical terms
  | 'THEORY'           // Theories and models
  | 'METHOD'           // Methodologies and approaches
  | 'TOOL'             // Tools and instruments
  | 'METRIC'           // Measurements and metrics
  | 'EVENT'            // Historical or significant events
  | 'PUBLICATION'      // Books, papers, articles
  | 'LAW'              // Legal concepts, regulations
  | 'DISEASE'          // Medical conditions
  | 'CHEMICAL'         // Chemical compounds
  | 'GENE'             // Genetic entities
  | 'SPECIES'          // Biological species
  | 'MISC';            // Miscellaneous entities

export type ImportanceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface NERResult {
  entities: Entity[];
  totalEntities: number;
  entitiesByType: Record<EntityType, number>;
  confidence: number;
  processingTime: number;
}

export interface NEROptions {
  includeTypes?: EntityType[];
  excludeTypes?: EntityType[];
  minConfidence?: number;
  minImportance?: ImportanceLevel;
  contextWindow?: number; // Characters around entity for context
  deduplication?: boolean;
}

// Definition and concept extraction interfaces
export interface Definition {
  id: string;
  term: string;
  definition: string;
  context: string;
  confidence: number;
  importance: ImportanceLevel;
  sourceLocation: {
    section: string;
    paragraph?: number;
    sentence?: number;
  };
  definitionType: DefinitionType;
  relatedTerms?: string[];
  examples?: string[];
  metadata?: Record<string, any>;
}

export type DefinitionType = 
  | 'EXPLICIT'      // Direct definition (e.g., "X is defined as...")
  | 'IMPLICIT'      // Implied definition from context
  | 'EXAMPLE'       // Definition through examples
  | 'COMPARISON'    // Definition through comparison
  | 'FUNCTIONAL'    // Definition by function or purpose
  | 'CLASSIFICATION'; // Definition by category

export interface Concept {
  id: string;
  name: string;
  description: string;
  category: ConceptCategory;
  confidence: number;
  importance: ImportanceLevel;
  sourceLocation: {
    section: string;
    paragraph?: number;
    sentence?: number;
  };
  keyPoints: string[];
  relatedConcepts?: string[];
  examples?: string[];
  applications?: string[];
  metadata?: Record<string, any>;
}

export type ConceptCategory = 
  | 'THEORY'        // Theoretical concepts
  | 'METHOD'        // Methodological concepts
  | 'PRINCIPLE'     // Fundamental principles
  | 'PROCESS'       // Process descriptions
  | 'FRAMEWORK'     // Conceptual frameworks
  | 'MODEL'         // Models and representations
  | 'TECHNIQUE'     // Technical techniques
  | 'APPROACH'      // Approaches and strategies
  | 'PHENOMENON'    // Natural or observed phenomena
  | 'SYSTEM'        // System concepts
  | 'TOOL'          // Tools and instruments
  | 'METRIC'        // Measurement concepts
  | 'GENERAL';      // General concepts

export interface DefinitionExtractionResult {
  definitions: Definition[];
  totalDefinitions: number;
  definitionsByType: Record<DefinitionType, number>;
  confidence: number;
  processingTime: number;
}

export interface ConceptExtractionResult {
  concepts: Concept[];
  totalConcepts: number;
  conceptsByCategory: Record<ConceptCategory, number>;
  confidence: number;
  processingTime: number;
}

export interface DefinitionExtractionOptions {
  includeTypes?: DefinitionType[];
  excludeTypes?: DefinitionType[];
  minConfidence?: number;
  minImportance?: ImportanceLevel;
  includeExamples?: boolean;
  includeRelatedTerms?: boolean;
  deduplication?: boolean;
}

export interface ConceptExtractionOptions {
  includeCategories?: ConceptCategory[];
  excludeCategories?: ConceptCategory[];
  minConfidence?: number;
  minImportance?: ImportanceLevel;
  includeKeyPoints?: boolean;
  includeRelatedConcepts?: boolean;
  includeExamples?: boolean;
  includeApplications?: boolean;
  deduplication?: boolean;
}

// Formula and theorem extraction interfaces
export interface Formula {
  id: string;
  name?: string;
  expression: string;
  latex?: string;
  description: string;
  context: string;
  confidence: number;
  importance: ImportanceLevel;
  sourceLocation: {
    section: string;
    paragraph?: number;
    sentence?: number;
  };
  formulaType: FormulaType;
  variables?: Variable[];
  domain?: string;
  applications?: string[];
  relatedFormulas?: string[];
  metadata?: Record<string, any>;
}

export interface Variable {
  symbol: string;
  description: string;
  unit?: string;
  constraints?: string;
}

export type FormulaType = 
  | 'EQUATION'        // Mathematical equations
  | 'INEQUALITY'      // Mathematical inequalities
  | 'FUNCTION'        // Function definitions
  | 'IDENTITY'        // Mathematical identities
  | 'THEOREM'         // Mathematical theorems
  | 'LEMMA'           // Mathematical lemmas
  | 'COROLLARY'       // Corollaries
  | 'DEFINITION'      // Mathematical definitions
  | 'AXIOM'           // Mathematical axioms
  | 'FORMULA'         // General formulas
  | 'EXPRESSION'      // Mathematical expressions
  | 'PROOF'           // Proof steps
  | 'ALGORITHM'       // Algorithmic formulations
  | 'STATISTICAL'     // Statistical formulas
  | 'PHYSICAL'        // Physics formulas
  | 'CHEMICAL'        // Chemistry formulas
  | 'ECONOMIC'        // Economic formulas
  | 'GENERAL';        // General mathematical content

export interface Theorem {
  id: string;
  name: string;
  statement: string;
  proof?: string;
  context: string;
  confidence: number;
  importance: ImportanceLevel;
  sourceLocation: {
    section: string;
    paragraph?: number;
    sentence?: number;
  };
  theoremType: TheoremType;
  domain: string;
  prerequisites?: string[];
  applications?: string[];
  relatedTheorems?: string[];
  corollaries?: string[];
  examples?: string[];
  metadata?: Record<string, any>;
}

export type TheoremType = 
  | 'THEOREM'         // Main theorems
  | 'LEMMA'           // Supporting lemmas
  | 'COROLLARY'       // Corollaries
  | 'PROPOSITION'     // Propositions
  | 'AXIOM'           // Axioms
  | 'POSTULATE'       // Postulates
  | 'PRINCIPLE'       // Principles
  | 'LAW'             // Scientific laws
  | 'RULE'            // Rules and guidelines
  | 'PROPERTY'        // Mathematical properties
  | 'CONJECTURE'      // Conjectures
  | 'HYPOTHESIS'      // Hypotheses
  | 'DEFINITION'      // Formal definitions
  | 'GENERAL';        // General theoretical content

export interface FormulaExtractionResult {
  formulas: Formula[];
  totalFormulas: number;
  formulasByType: Record<FormulaType, number>;
  confidence: number;
  processingTime: number;
}

export interface TheoremExtractionResult {
  theorems: Theorem[];
  totalTheorems: number;
  theoremsByType: Record<TheoremType, number>;
  confidence: number;
  processingTime: number;
}

export interface FormulaExtractionOptions {
  includeTypes?: FormulaType[];
  excludeTypes?: FormulaType[];
  minConfidence?: number;
  minImportance?: ImportanceLevel;
  includeLatex?: boolean;
  includeVariables?: boolean;
  includeApplications?: boolean;
  includeRelatedFormulas?: boolean;
  deduplication?: boolean;
}

export interface TheoremExtractionOptions {
  includeTypes?: TheoremType[];
  excludeTypes?: TheoremType[];
  minConfidence?: number;
  minImportance?: ImportanceLevel;
  includeProof?: boolean;
  includePrerequisites?: boolean;
  includeApplications?: boolean;
  includeRelatedTheorems?: boolean;
  includeCorollaries?: boolean;
  includeExamples?: boolean;
  deduplication?: boolean;
}

// Relationship extraction interfaces
export interface Relationship {
  id: string;
  sourceEntity: string;
  targetEntity: string;
  relationshipType: RelationshipType;
  description: string;
  context: string;
  confidence: number;
  importance: ImportanceLevel;
  sourceLocation: {
    section: string;
    paragraph?: number;
    sentence?: number;
  };
  direction: RelationshipDirection;
  strength: number; // 0.0-1.0 indicating relationship strength
  evidence: string[];
  metadata?: Record<string, any>;
}

export type RelationshipType = 
  | 'IS_A'              // Taxonomic relationship (A is a type of B)
  | 'PART_OF'           // Compositional relationship (A is part of B)
  | 'CAUSES'            // Causal relationship (A causes B)
  | 'ENABLES'           // Enabling relationship (A enables B)
  | 'REQUIRES'          // Dependency relationship (A requires B)
  | 'SIMILAR_TO'        // Similarity relationship (A is similar to B)
  | 'OPPOSITE_TO'       // Opposition relationship (A is opposite to B)
  | 'RELATED_TO'        // General relationship (A is related to B)
  | 'DERIVES_FROM'      // Derivation relationship (A derives from B)
  | 'APPLIES_TO'        // Application relationship (A applies to B)
  | 'INFLUENCES'        // Influence relationship (A influences B)
  | 'CONTAINS'          // Containment relationship (A contains B)
  | 'USES'              // Usage relationship (A uses B)
  | 'IMPLEMENTS'        // Implementation relationship (A implements B)
  | 'EXTENDS'           // Extension relationship (A extends B)
  | 'PRECEDES'          // Temporal relationship (A precedes B)
  | 'FOLLOWS'           // Temporal relationship (A follows B)
  | 'EQUIVALENT_TO'     // Equivalence relationship (A is equivalent to B)
  | 'CONTRADICTS'       // Contradiction relationship (A contradicts B)
  | 'SUPPORTS'          // Support relationship (A supports B)
  | 'GENERAL';          // General unspecified relationship

export type RelationshipDirection = 
  | 'DIRECTED'          // One-way relationship (A -> B)
  | 'BIDIRECTIONAL'     // Two-way relationship (A <-> B)
  | 'UNDIRECTED';       // Non-directional relationship (A -- B)

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<string, number>;
    relationshipTypes: Record<RelationshipType, number>;
    confidence: number;
    coverage: number; // Percentage of entities that have relationships
  };
}

export interface KnowledgeNode {
  id: string;
  label: string;
  type: 'entity' | 'concept' | 'definition' | 'formula' | 'theorem';
  properties: Record<string, any>;
  importance: ImportanceLevel;
  confidence: number;
}

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  label: string;
  properties: Record<string, any>;
  weight: number; // Relationship strength
  confidence: number;
  direction: RelationshipDirection;
}

export interface RelationshipExtractionResult {
  relationships: Relationship[];
  totalRelationships: number;
  relationshipsByType: Record<RelationshipType, number>;
  knowledgeGraph: KnowledgeGraph;
  confidence: number;
  processingTime: number;
}

export interface RelationshipExtractionOptions {
  includeTypes?: RelationshipType[];
  excludeTypes?: RelationshipType[];
  minConfidence?: number;
  minImportance?: ImportanceLevel;
  minStrength?: number;
  includeEvidence?: boolean;
  buildKnowledgeGraph?: boolean;
  deduplication?: boolean;
  maxRelationshipsPerEntity?: number;
}

// Knowledge Extraction Agent - Extracts entities, definitions, formulas
export class KnowledgeExtractionAgent {
  private aiService: AIService;

  constructor() {
    this.aiService = createAIService();
  }

  /**
   * Extract named entities from structured text
   */
  async extractEntities(
    documentId: string,
    userId: string,
    structuredText: StructuredText,
    options: NEROptions = {}
  ): Promise<NERResult> {
    const startTime = Date.now();
    
    try {
      Logger.info(`Starting NER extraction for document ${documentId}`);

      // Set default options
      const opts: Required<NEROptions> = {
        includeTypes: options.includeTypes || this.getAllEntityTypes(),
        excludeTypes: options.excludeTypes || [],
        minConfidence: options.minConfidence || 0.6,
        minImportance: options.minImportance || 'LOW',
        contextWindow: options.contextWindow || 100,
        deduplication: options.deduplication !== false,
      };

      // Extract entities from each section
      const allEntities: Entity[] = [];
      let entityIdCounter = 1;

      for (const section of structuredText.sections) {
        const sectionEntities = await this.extractEntitiesFromSection(
          section,
          entityIdCounter,
          opts
        );
        allEntities.push(...sectionEntities);
        entityIdCounter += sectionEntities.length;

        // Process subsections if they exist
        if (section.subsections) {
          for (const subsection of section.subsections) {
            const subsectionEntities = await this.extractEntitiesFromSection(
              { heading: subsection.heading, content: subsection.content },
              entityIdCounter,
              opts,
              section.heading
            );
            allEntities.push(...subsectionEntities);
            entityIdCounter += subsectionEntities.length;
          }
        }
      }

      // Filter entities based on options
      let filteredEntities = this.filterEntities(allEntities, opts);

      // Deduplicate if requested
      if (opts.deduplication) {
        filteredEntities = this.deduplicateEntities(filteredEntities);
      }

      // Store entities in MongoDB
      await this.storeEntities(documentId, userId, filteredEntities);

      const processingTime = Date.now() - startTime;
      const entitiesByType = this.groupEntitiesByType(filteredEntities);

      const result: NERResult = {
        entities: filteredEntities,
        totalEntities: filteredEntities.length,
        entitiesByType,
        confidence: this.calculateOverallConfidence(filteredEntities),
        processingTime
      };

      Logger.info(`NER extraction completed for document ${documentId}. Found ${filteredEntities.length} entities in ${processingTime}ms`);
      return result;

    } catch (error) {
      Logger.error(`Error in NER extraction for document ${documentId}:`, error);
      throw new Error(`Failed to extract entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract entities from a single section
   */
  private async extractEntitiesFromSection(
    section: { heading: string; content: string },
    startId: number,
    options: Required<NEROptions>,
    parentSection?: string
  ): Promise<Entity[]> {
    const prompt = this.buildNERPrompt(section.content, options);
    
    try {
      const response = await (this.aiService as any).client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in named entity recognition for academic and professional documents. Extract entities with high precision and provide detailed context and classification.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseNERResponse(
        content,
        section,
        startId,
        options,
        parentSection
      );

    } catch (error) {
      Logger.error(`Error extracting entities from section "${section.heading}":`, error);
      throw error; // Re-throw to propagate error to main function
    }
  }

  /**
   * Build prompt for NER extraction
   */
  private buildNERPrompt(text: string, options: Required<NEROptions>): string {
    const entityTypes = options.includeTypes
      .filter(type => !options.excludeTypes.includes(type))
      .join(', ');

    return `Extract named entities from the following text. For each entity, provide:

1. The exact text of the entity
2. Entity type from: ${entityTypes}
3. Start and end character positions
4. Confidence score (0.0-1.0)
5. Importance level (LOW, MEDIUM, HIGH, CRITICAL)
6. Brief context (surrounding text)
7. Any relevant metadata

Only include entities with confidence >= ${options.minConfidence} and importance >= ${options.minImportance}.

Format your response exactly as follows:

ENTITIES:
Entity: [exact text]
Type: [entity type]
Start: [start position]
End: [end position]
Confidence: 0.XX
Importance: [importance level]
Context: [surrounding text within ${options.contextWindow} characters]
Metadata: [any relevant information as key:value pairs, or "none"]

Entity: [next entity...]
[Continue for all entities...]

Text to analyze:
${text}`;
  }

  /**
   * Parse NER response from AI service
   */
  private parseNERResponse(
    content: string,
    section: { heading: string; content: string },
    startId: number,
    options: Required<NEROptions>,
    parentSection?: string
  ): Entity[] {
    const entities: Entity[] = [];
    
    try {
      // Split by "Entity:" to get individual entity blocks
      const entityBlocks = content.split(/Entity:\s*/).filter(block => block.trim());

      for (let i = 0; i < entityBlocks.length; i++) {
        const block = entityBlocks[i].trim();
        if (!block) continue;

        const lines = block.split('\n').map(line => line.trim());
        const entityText = lines[0];

        if (!entityText) continue;

        // Extract entity properties
        const typeMatch = block.match(/Type:\s*(.+)/);
        const startMatch = block.match(/Start:\s*(\d+)/);
        const endMatch = block.match(/End:\s*(\d+)/);
        const confidenceMatch = block.match(/Confidence:\s*([\d.]+)/);
        const importanceMatch = block.match(/Importance:\s*(.+)/);
        const contextMatch = block.match(/Context:\s*(.+)/);
        const metadataMatch = block.match(/Metadata:\s*(.+)/);

        if (!typeMatch || !startMatch || !endMatch || !confidenceMatch || !importanceMatch) {
          continue;
        }

        const entityType = typeMatch[1].trim() as EntityType;
        const confidence = parseFloat(confidenceMatch[1]);
        const importance = importanceMatch[1].trim() as ImportanceLevel;

        // Validate entity type
        if (!this.getAllEntityTypes().includes(entityType)) {
          continue;
        }

        // Parse metadata
        let metadata: Record<string, any> = {};
        if (metadataMatch && metadataMatch[1].trim().toLowerCase() !== 'none') {
          try {
            const metadataStr = metadataMatch[1].trim();
            const pairs = metadataStr.split(',');
            for (const pair of pairs) {
              const [key, value] = pair.split(':').map(s => s.trim());
              if (key && value) {
                metadata[key] = value;
              }
            }
          } catch (error) {
            // Ignore metadata parsing errors
          }
        }

        const entity: Entity = {
          id: `entity_${startId + i}`,
          text: entityText,
          type: entityType,
          startPosition: parseInt(startMatch[1]),
          endPosition: parseInt(endMatch[1]),
          confidence,
          importance,
          context: contextMatch ? contextMatch[1].trim() : '',
          sourceLocation: {
            section: parentSection ? `${parentSection} > ${section.heading}` : section.heading,
            paragraph: this.estimateParagraphNumber(section.content, parseInt(startMatch[1])),
            sentence: this.estimateSentenceNumber(section.content, parseInt(startMatch[1]))
          },
          metadata
        };

        entities.push(entity);
      }

    } catch (error) {
      Logger.error('Error parsing NER response:', error);
    }

    return entities;
  }

  /**
   * Filter entities based on options
   */
  private filterEntities(entities: Entity[], options: Required<NEROptions>): Entity[] {
    return entities.filter(entity => {
      // Check confidence threshold
      if (entity.confidence < options.minConfidence) {
        return false;
      }

      // Check importance level
      const importanceLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const minImportanceIndex = importanceLevels.indexOf(options.minImportance);
      const entityImportanceIndex = importanceLevels.indexOf(entity.importance);
      
      if (entityImportanceIndex < minImportanceIndex) {
        return false;
      }

      // Check included/excluded types
      if (options.excludeTypes.includes(entity.type)) {
        return false;
      }

      if (options.includeTypes.length > 0 && !options.includeTypes.includes(entity.type)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Remove duplicate entities
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Map<string, Entity>();
    
    for (const entity of entities) {
      const key = `${entity.text.toLowerCase()}_${entity.type}`;
      const existing = seen.get(key);
      
      if (!existing || entity.confidence > existing.confidence) {
        seen.set(key, entity);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Store entities in MongoDB
   */
  private async storeEntities(documentId: string, userId: string, entities: Entity[]): Promise<void> {
    try {
      for (const entity of entities) {
        const knowledgeElement: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'> = {
          document_id: documentId,
          user_id: userId,
          agent_type: 'extraction',
          element_type: 'entity',
          content: {
            title: entity.text,
            body: `Entity: ${entity.text}\nType: ${entity.type}\nImportance: ${entity.importance}\nContext: ${entity.context}`,
            metadata: {
              entityType: entity.type,
              confidence: entity.confidence,
              importance: entity.importance,
              startPosition: entity.startPosition,
              endPosition: entity.endPosition,
              context: entity.context,
              ...entity.metadata
            }
          },
          source_location: {
            section: entity.sourceLocation.section,
            position: {
              paragraph: entity.sourceLocation.paragraph,
              sentence: entity.sourceLocation.sentence,
              startChar: entity.startPosition,
              endChar: entity.endPosition
            }
          },
          tags: [entity.type.toLowerCase(), entity.importance.toLowerCase(), 'entity', 'ner'],
          confidence_score: entity.confidence
        };

        await mongoConnection.insertKnowledgeElement(knowledgeElement);
      }

      Logger.info(`Stored ${entities.length} entities for document ${documentId}`);
    } catch (error) {
      Logger.error(`Error storing entities for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Group entities by type for statistics
   */
  private groupEntitiesByType(entities: Entity[]): Record<EntityType, number> {
    const grouped: Record<EntityType, number> = {} as Record<EntityType, number>;
    
    for (const entity of entities) {
      grouped[entity.type] = (grouped[entity.type] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(entities: Entity[]): number {
    if (entities.length === 0) return 0;
    
    const totalConfidence = entities.reduce((sum, entity) => sum + entity.confidence, 0);
    return totalConfidence / entities.length;
  }

  /**
   * Get all available entity types
   */
  private getAllEntityTypes(): EntityType[] {
    return [
      'PERSON', 'ORGANIZATION', 'LOCATION', 'DATE', 'TIME', 'MONEY', 'PERCENT',
      'CONCEPT', 'TERM', 'THEORY', 'METHOD', 'TOOL', 'METRIC', 'EVENT',
      'PUBLICATION', 'LAW', 'DISEASE', 'CHEMICAL', 'GENE', 'SPECIES', 'MISC'
    ];
  }

  /**
   * Estimate paragraph number from character position
   */
  private estimateParagraphNumber(text: string, position: number): number {
    const beforePosition = text.substring(0, position);
    const paragraphs = beforePosition.split(/\n\s*\n/);
    return paragraphs.length;
  }

  /**
   * Estimate sentence number from character position
   */
  private estimateSentenceNumber(text: string, position: number): number {
    const beforePosition = text.substring(0, position);
    const sentences = beforePosition.split(/[.!?]+/);
    return sentences.length;
  }

  /**
   * Get entities by document ID
   */
  async getEntitiesByDocument(documentId: string, options?: {
    types?: EntityType[];
    minConfidence?: number;
    limit?: number;
  }): Promise<Entity[]> {
    try {
      const filter: any = {
        document_id: documentId,
        agent_type: 'extraction',
        element_type: 'entity'
      };

      if (options?.minConfidence) {
        filter.confidence_score = { $gte: options.minConfidence };
      }

      const knowledgeElements = await mongoConnection.findKnowledgeElements(filter, {
        limit: options?.limit,
        sort: { confidence_score: -1 }
      });

      return knowledgeElements.map(this.knowledgeElementToEntity);
    } catch (error) {
      Logger.error(`Error retrieving entities for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Search entities by text
   */
  async searchEntities(searchText: string, documentId?: string): Promise<Entity[]> {
    try {
      const filter: any = {
        agent_type: 'extraction',
        element_type: 'entity'
      };

      if (documentId) {
        filter.document_id = documentId;
      }

      const knowledgeElements = await mongoConnection.searchKnowledgeElements(searchText, filter);
      return knowledgeElements.map(this.knowledgeElementToEntity);
    } catch (error) {
      Logger.error(`Error searching entities with text "${searchText}":`, error);
      throw error;
    }
  }

  /**
   * Extract definitions from structured text
   */
  async extractDefinitions(
    documentId: string,
    userId: string,
    structuredText: StructuredText,
    options: DefinitionExtractionOptions = {}
  ): Promise<DefinitionExtractionResult> {
    const startTime = Date.now();
    
    try {
      Logger.info(`Starting definition extraction for document ${documentId}`);

      // Set default options
      const opts: Required<DefinitionExtractionOptions> = {
        includeTypes: options.includeTypes || this.getAllDefinitionTypes(),
        excludeTypes: options.excludeTypes || [],
        minConfidence: options.minConfidence || 0.6,
        minImportance: options.minImportance || 'LOW',
        includeExamples: options.includeExamples !== false,
        includeRelatedTerms: options.includeRelatedTerms !== false,
        deduplication: options.deduplication !== false,
      };

      // Extract definitions from each section
      const allDefinitions: Definition[] = [];
      let definitionIdCounter = 1;

      for (const section of structuredText.sections) {
        const sectionDefinitions = await this.extractDefinitionsFromSection(
          section,
          definitionIdCounter,
          opts
        );
        allDefinitions.push(...sectionDefinitions);
        definitionIdCounter += sectionDefinitions.length;

        // Process subsections if they exist
        if (section.subsections) {
          for (const subsection of section.subsections) {
            const subsectionDefinitions = await this.extractDefinitionsFromSection(
              { heading: subsection.heading, content: subsection.content },
              definitionIdCounter,
              opts,
              section.heading
            );
            allDefinitions.push(...subsectionDefinitions);
            definitionIdCounter += subsectionDefinitions.length;
          }
        }
      }

      // Filter definitions based on options
      let filteredDefinitions = this.filterDefinitions(allDefinitions, opts);

      // Deduplicate if requested
      if (opts.deduplication) {
        filteredDefinitions = this.deduplicateDefinitions(filteredDefinitions);
      }

      // Store definitions in MongoDB
      await this.storeDefinitions(documentId, userId, filteredDefinitions);

      const processingTime = Date.now() - startTime;
      const definitionsByType = this.groupDefinitionsByType(filteredDefinitions);

      const result: DefinitionExtractionResult = {
        definitions: filteredDefinitions,
        totalDefinitions: filteredDefinitions.length,
        definitionsByType,
        confidence: this.calculateDefinitionConfidence(filteredDefinitions),
        processingTime
      };

      Logger.info(`Definition extraction completed for document ${documentId}. Found ${filteredDefinitions.length} definitions in ${processingTime}ms`);
      return result;

    } catch (error) {
      Logger.error(`Error in definition extraction for document ${documentId}:`, error);
      throw new Error(`Failed to extract definitions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract concepts from structured text
   */
  async extractConcepts(
    documentId: string,
    userId: string,
    structuredText: StructuredText,
    options: ConceptExtractionOptions = {}
  ): Promise<ConceptExtractionResult> {
    const startTime = Date.now();
    
    try {
      Logger.info(`Starting concept extraction for document ${documentId}`);

      // Set default options
      const opts: Required<ConceptExtractionOptions> = {
        includeCategories: options.includeCategories || this.getAllConceptCategories(),
        excludeCategories: options.excludeCategories || [],
        minConfidence: options.minConfidence || 0.6,
        minImportance: options.minImportance || 'LOW',
        includeKeyPoints: options.includeKeyPoints !== false,
        includeRelatedConcepts: options.includeRelatedConcepts !== false,
        includeExamples: options.includeExamples !== false,
        includeApplications: options.includeApplications !== false,
        deduplication: options.deduplication !== false,
      };

      // Extract concepts from each section
      const allConcepts: Concept[] = [];
      let conceptIdCounter = 1;

      for (const section of structuredText.sections) {
        const sectionConcepts = await this.extractConceptsFromSection(
          section,
          conceptIdCounter,
          opts
        );
        allConcepts.push(...sectionConcepts);
        conceptIdCounter += sectionConcepts.length;

        // Process subsections if they exist
        if (section.subsections) {
          for (const subsection of section.subsections) {
            const subsectionConcepts = await this.extractConceptsFromSection(
              { heading: subsection.heading, content: subsection.content },
              conceptIdCounter,
              opts,
              section.heading
            );
            allConcepts.push(...subsectionConcepts);
            conceptIdCounter += subsectionConcepts.length;
          }
        }
      }

      // Filter concepts based on options
      let filteredConcepts = this.filterConcepts(allConcepts, opts);

      // Deduplicate if requested
      if (opts.deduplication) {
        filteredConcepts = this.deduplicateConcepts(filteredConcepts);
      }

      // Store concepts in MongoDB
      await this.storeConcepts(documentId, userId, filteredConcepts);

      const processingTime = Date.now() - startTime;
      const conceptsByCategory = this.groupConceptsByCategory(filteredConcepts);

      const result: ConceptExtractionResult = {
        concepts: filteredConcepts,
        totalConcepts: filteredConcepts.length,
        conceptsByCategory,
        confidence: this.calculateConceptConfidence(filteredConcepts),
        processingTime
      };

      Logger.info(`Concept extraction completed for document ${documentId}. Found ${filteredConcepts.length} concepts in ${processingTime}ms`);
      return result;

    } catch (error) {
      Logger.error(`Error in concept extraction for document ${documentId}:`, error);
      throw new Error(`Failed to extract concepts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract definitions from a single section
   */
  private async extractDefinitionsFromSection(
    section: { heading: string; content: string },
    startId: number,
    options: Required<DefinitionExtractionOptions>,
    parentSection?: string
  ): Promise<Definition[]> {
    const prompt = this.buildDefinitionExtractionPrompt(section.content, options);
    
    try {
      const response = await (this.aiService as any).client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in extracting definitions and explanations from academic and professional documents. Identify clear, precise definitions with high accuracy.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseDefinitionResponse(
        content,
        section,
        startId,
        options,
        parentSection
      );

    } catch (error) {
      Logger.error(`Error extracting definitions from section "${section.heading}":`, error);
      throw error;
    }
  }

  /**
   * Extract concepts from a single section
   */
  private async extractConceptsFromSection(
    section: { heading: string; content: string },
    startId: number,
    options: Required<ConceptExtractionOptions>,
    parentSection?: string
  ): Promise<Concept[]> {
    const prompt = this.buildConceptExtractionPrompt(section.content, options);
    
    try {
      const response = await (this.aiService as any).client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in identifying and explaining concepts from academic and professional documents. Extract meaningful concepts with detailed descriptions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseConceptResponse(
        content,
        section,
        startId,
        options,
        parentSection
      );

    } catch (error) {
      Logger.error(`Error extracting concepts from section "${section.heading}":`, error);
      throw error;
    }
  }

  /**
   * Build prompt for definition extraction
   */
  private buildDefinitionExtractionPrompt(text: string, options: Required<DefinitionExtractionOptions>): string {
    const definitionTypes = options.includeTypes
      .filter(type => !options.excludeTypes.includes(type))
      .join(', ');

    return `Extract definitions and explanations from the following text. For each definition, provide:

1. The term being defined
2. The definition/explanation
3. Definition type from: ${definitionTypes}
4. Confidence score (0.0-1.0)
5. Importance level (LOW, MEDIUM, HIGH, CRITICAL)
6. Context (surrounding text)
7. Related terms (if available)
8. Examples (if available)

Only include definitions with confidence >= ${options.minConfidence} and importance >= ${options.minImportance}.

Format your response exactly as follows:

DEFINITIONS:
Term: [term being defined]
Definition: [clear definition or explanation]
Type: [definition type]
Confidence: 0.XX
Importance: [importance level]
Context: [surrounding context]
Related: [comma-separated related terms, or "none"]
Examples: [comma-separated examples, or "none"]

Term: [next term...]
[Continue for all definitions...]

Text to analyze:
${text}`;
  }

  /**
   * Build prompt for concept extraction
   */
  private buildConceptExtractionPrompt(text: string, options: Required<ConceptExtractionOptions>): string {
    const conceptCategories = options.includeCategories
      .filter(cat => !options.excludeCategories.includes(cat))
      .join(', ');

    return `Extract key concepts and their explanations from the following text. For each concept, provide:

1. The concept name
2. A clear description/explanation
3. Category from: ${conceptCategories}
4. Confidence score (0.0-1.0)
5. Importance level (LOW, MEDIUM, HIGH, CRITICAL)
6. Key points (main aspects of the concept)
7. Related concepts (if available)
8. Examples (if available)
9. Applications (if available)

Only include concepts with confidence >= ${options.minConfidence} and importance >= ${options.minImportance}.

Format your response exactly as follows:

CONCEPTS:
Name: [concept name]
Description: [clear description/explanation]
Category: [concept category]
Confidence: 0.XX
Importance: [importance level]
KeyPoints: [semicolon-separated key points]
Related: [comma-separated related concepts, or "none"]
Examples: [comma-separated examples, or "none"]
Applications: [comma-separated applications, or "none"]

Name: [next concept...]
[Continue for all concepts...]

Text to analyze:
${text}`;
  }

  /**
   * Parse definition extraction response
   */
  private parseDefinitionResponse(
    content: string,
    section: { heading: string; content: string },
    startId: number,
    options: Required<DefinitionExtractionOptions>,
    parentSection?: string
  ): Definition[] {
    const definitions: Definition[] = [];
    
    try {
      const definitionBlocks = content.split(/Term:\s*/).filter(block => block.trim());

      for (let i = 0; i < definitionBlocks.length; i++) {
        const block = definitionBlocks[i].trim();
        if (!block) continue;

        const lines = block.split('\n').map(line => line.trim());
        const term = lines[0];

        if (!term) continue;

        const definitionMatch = block.match(/Definition:\s*(.+)/);
        const typeMatch = block.match(/Type:\s*(.+)/);
        const confidenceMatch = block.match(/Confidence:\s*([\d.]+)/);
        const importanceMatch = block.match(/Importance:\s*(.+)/);
        const contextMatch = block.match(/Context:\s*(.+)/);
        const relatedMatch = block.match(/Related:\s*(.+)/);
        const examplesMatch = block.match(/Examples:\s*(.+)/);

        if (!definitionMatch || !typeMatch || !confidenceMatch || !importanceMatch) {
          continue;
        }

        const definitionType = typeMatch[1].trim() as DefinitionType;
        const confidence = parseFloat(confidenceMatch[1]);
        const importance = importanceMatch[1].trim() as ImportanceLevel;

        // Validate definition type
        if (!this.getAllDefinitionTypes().includes(definitionType)) {
          continue;
        }

        // Parse related terms
        const relatedTerms = relatedMatch && relatedMatch[1].trim().toLowerCase() !== 'none' 
          ? relatedMatch[1].split(',').map(t => t.trim()).filter(t => t)
          : [];

        // Parse examples
        const examples = examplesMatch && examplesMatch[1].trim().toLowerCase() !== 'none'
          ? examplesMatch[1].split(',').map(e => e.trim()).filter(e => e)
          : [];

        const definition: Definition = {
          id: `def_${startId + i}`,
          term,
          definition: definitionMatch[1].trim(),
          context: contextMatch ? contextMatch[1].trim() : '',
          confidence,
          importance,
          sourceLocation: {
            section: parentSection ? `${parentSection} > ${section.heading}` : section.heading,
            paragraph: this.estimateParagraphNumber(section.content, 0),
            sentence: this.estimateSentenceNumber(section.content, 0)
          },
          definitionType,
          relatedTerms: relatedTerms.length > 0 ? relatedTerms : undefined,
          examples: examples.length > 0 ? examples : undefined
        };

        definitions.push(definition);
      }

    } catch (error) {
      Logger.error('Error parsing definition response:', error);
    }

    return definitions;
  }

  /**
   * Parse concept extraction response
   */
  private parseConceptResponse(
    content: string,
    section: { heading: string; content: string },
    startId: number,
    options: Required<ConceptExtractionOptions>,
    parentSection?: string
  ): Concept[] {
    const concepts: Concept[] = [];
    
    try {
      const conceptBlocks = content.split(/Name:\s*/).filter(block => block.trim());

      for (let i = 0; i < conceptBlocks.length; i++) {
        const block = conceptBlocks[i].trim();
        if (!block) continue;

        const lines = block.split('\n').map(line => line.trim());
        const name = lines[0];

        if (!name) continue;

        const descriptionMatch = block.match(/Description:\s*(.+)/);
        const categoryMatch = block.match(/Category:\s*(.+)/);
        const confidenceMatch = block.match(/Confidence:\s*([\d.]+)/);
        const importanceMatch = block.match(/Importance:\s*(.+)/);
        const keyPointsMatch = block.match(/KeyPoints:\s*(.+)/);
        const relatedMatch = block.match(/Related:\s*(.+)/);
        const examplesMatch = block.match(/Examples:\s*(.+)/);
        const applicationsMatch = block.match(/Applications:\s*(.+)/);

        if (!descriptionMatch || !categoryMatch || !confidenceMatch || !importanceMatch) {
          continue;
        }

        const category = categoryMatch[1].trim() as ConceptCategory;
        const confidence = parseFloat(confidenceMatch[1]);
        const importance = importanceMatch[1].trim() as ImportanceLevel;

        // Validate concept category
        if (!this.getAllConceptCategories().includes(category)) {
          continue;
        }

        // Parse key points
        const keyPoints = keyPointsMatch 
          ? keyPointsMatch[1].split(';').map(p => p.trim()).filter(p => p)
          : [];

        // Parse related concepts
        const relatedConcepts = relatedMatch && relatedMatch[1].trim().toLowerCase() !== 'none'
          ? relatedMatch[1].split(',').map(c => c.trim()).filter(c => c)
          : [];

        // Parse examples
        const examples = examplesMatch && examplesMatch[1].trim().toLowerCase() !== 'none'
          ? examplesMatch[1].split(',').map(e => e.trim()).filter(e => e)
          : [];

        // Parse applications
        const applications = applicationsMatch && applicationsMatch[1].trim().toLowerCase() !== 'none'
          ? applicationsMatch[1].split(',').map(a => a.trim()).filter(a => a)
          : [];

        const concept: Concept = {
          id: `concept_${startId + i}`,
          name,
          description: descriptionMatch[1].trim(),
          category,
          confidence,
          importance,
          sourceLocation: {
            section: parentSection ? `${parentSection} > ${section.heading}` : section.heading,
            paragraph: this.estimateParagraphNumber(section.content, 0),
            sentence: this.estimateSentenceNumber(section.content, 0)
          },
          keyPoints,
          relatedConcepts: relatedConcepts.length > 0 ? relatedConcepts : undefined,
          examples: examples.length > 0 ? examples : undefined,
          applications: applications.length > 0 ? applications : undefined
        };

        concepts.push(concept);
      }

    } catch (error) {
      Logger.error('Error parsing concept response:', error);
    }

    return concepts;
  }

  /**
   * Filter definitions based on options
   */
  private filterDefinitions(definitions: Definition[], options: Required<DefinitionExtractionOptions>): Definition[] {
    return definitions.filter(definition => {
      if (definition.confidence < options.minConfidence) return false;

      const importanceLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const minImportanceIndex = importanceLevels.indexOf(options.minImportance);
      const definitionImportanceIndex = importanceLevels.indexOf(definition.importance);
      
      if (definitionImportanceIndex < minImportanceIndex) return false;

      if (options.excludeTypes.includes(definition.definitionType)) return false;

      if (options.includeTypes.length > 0 && !options.includeTypes.includes(definition.definitionType)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Filter concepts based on options
   */
  private filterConcepts(concepts: Concept[], options: Required<ConceptExtractionOptions>): Concept[] {
    return concepts.filter(concept => {
      if (concept.confidence < options.minConfidence) return false;

      const importanceLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const minImportanceIndex = importanceLevels.indexOf(options.minImportance);
      const conceptImportanceIndex = importanceLevels.indexOf(concept.importance);
      
      if (conceptImportanceIndex < minImportanceIndex) return false;

      if (options.excludeCategories.includes(concept.category)) return false;

      if (options.includeCategories.length > 0 && !options.includeCategories.includes(concept.category)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Deduplicate definitions
   */
  private deduplicateDefinitions(definitions: Definition[]): Definition[] {
    const seen = new Map<string, Definition>();
    
    for (const definition of definitions) {
      const key = definition.term.toLowerCase();
      const existing = seen.get(key);
      
      if (!existing || definition.confidence > existing.confidence) {
        seen.set(key, definition);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Deduplicate concepts
   */
  private deduplicateConcepts(concepts: Concept[]): Concept[] {
    const seen = new Map<string, Concept>();
    
    for (const concept of concepts) {
      const key = concept.name.toLowerCase();
      const existing = seen.get(key);
      
      if (!existing || concept.confidence > existing.confidence) {
        seen.set(key, concept);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Store definitions in MongoDB
   */
  private async storeDefinitions(documentId: string, userId: string, definitions: Definition[]): Promise<void> {
    try {
      for (const definition of definitions) {
        const knowledgeElement: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'> = {
          document_id: documentId,
          user_id: userId,
          agent_type: 'extraction',
          element_type: 'definition',
          content: {
            title: definition.term,
            body: definition.definition,
            metadata: {
              definitionType: definition.definitionType,
              confidence: definition.confidence,
              importance: definition.importance,
              context: definition.context,
              relatedTerms: definition.relatedTerms,
              examples: definition.examples
            }
          },
          source_location: {
            section: definition.sourceLocation.section,
            position: {
              paragraph: definition.sourceLocation.paragraph,
              sentence: definition.sourceLocation.sentence
            }
          },
          tags: [definition.definitionType.toLowerCase(), definition.importance.toLowerCase(), 'definition', 'extraction'],
          confidence_score: definition.confidence
        };

        await mongoConnection.insertKnowledgeElement(knowledgeElement);
      }

      Logger.info(`Stored ${definitions.length} definitions for document ${documentId}`);
    } catch (error) {
      Logger.error(`Error storing definitions for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Store concepts in MongoDB
   */
  private async storeConcepts(documentId: string, userId: string, concepts: Concept[]): Promise<void> {
    try {
      for (const concept of concepts) {
        const knowledgeElement: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'> = {
          document_id: documentId,
          user_id: userId,
          agent_type: 'extraction',
          element_type: 'concept',
          content: {
            title: concept.name,
            body: concept.description,
            metadata: {
              category: concept.category,
              confidence: concept.confidence,
              importance: concept.importance,
              keyPoints: concept.keyPoints,
              relatedConcepts: concept.relatedConcepts,
              examples: concept.examples,
              applications: concept.applications
            }
          },
          source_location: {
            section: concept.sourceLocation.section,
            position: {
              paragraph: concept.sourceLocation.paragraph,
              sentence: concept.sourceLocation.sentence
            }
          },
          tags: [concept.category.toLowerCase(), concept.importance.toLowerCase(), 'concept', 'extraction'],
          confidence_score: concept.confidence
        };

        await mongoConnection.insertKnowledgeElement(knowledgeElement);
      }

      Logger.info(`Stored ${concepts.length} concepts for document ${documentId}`);
    } catch (error) {
      Logger.error(`Error storing concepts for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Group definitions by type
   */
  private groupDefinitionsByType(definitions: Definition[]): Record<DefinitionType, number> {
    const grouped: Record<DefinitionType, number> = {} as Record<DefinitionType, number>;
    
    for (const definition of definitions) {
      grouped[definition.definitionType] = (grouped[definition.definitionType] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Group concepts by category
   */
  private groupConceptsByCategory(concepts: Concept[]): Record<ConceptCategory, number> {
    const grouped: Record<ConceptCategory, number> = {} as Record<ConceptCategory, number>;
    
    for (const concept of concepts) {
      grouped[concept.category] = (grouped[concept.category] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Calculate overall definition confidence
   */
  private calculateDefinitionConfidence(definitions: Definition[]): number {
    if (definitions.length === 0) return 0;
    
    const totalConfidence = definitions.reduce((sum, def) => sum + def.confidence, 0);
    return totalConfidence / definitions.length;
  }

  /**
   * Calculate overall concept confidence
   */
  private calculateConceptConfidence(concepts: Concept[]): number {
    if (concepts.length === 0) return 0;
    
    const totalConfidence = concepts.reduce((sum, concept) => sum + concept.confidence, 0);
    return totalConfidence / concepts.length;
  }

  /**
   * Get all available definition types
   */
  private getAllDefinitionTypes(): DefinitionType[] {
    return ['EXPLICIT', 'IMPLICIT', 'EXAMPLE', 'COMPARISON', 'FUNCTIONAL', 'CLASSIFICATION'];
  }

  /**
   * Get all available concept categories
   */
  private getAllConceptCategories(): ConceptCategory[] {
    return [
      'THEORY', 'METHOD', 'PRINCIPLE', 'PROCESS', 'FRAMEWORK', 'MODEL',
      'TECHNIQUE', 'APPROACH', 'PHENOMENON', 'SYSTEM', 'TOOL', 'METRIC', 'GENERAL'
    ];
  }

  /**
   * Extract formulas from a single section
   */
  private async extractFormulasFromSection(
    section: { heading: string; content: string },
    startId: number,
    options: Required<FormulaExtractionOptions>,
    parentSection?: string
  ): Promise<Formula[]> {
    const prompt = this.buildFormulaExtractionPrompt(section.content, options);
    
    try {
      const response = await (this.aiService as any).client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in extracting mathematical formulas, equations, and theorems from academic and scientific documents. Identify formulas with high precision and preserve their mathematical context.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseFormulaResponse(
        content,
        section,
        startId,
        options,
        parentSection
      );

    } catch (error) {
      Logger.error(`Error extracting formulas from section "${section.heading}":`, error);
      throw error;
    }
  }

  /**
   * Extract theorems from a single section
   */
  private async extractTheoremsFromSection(
    section: { heading: string; content: string },
    startId: number,
    options: Required<TheoremExtractionOptions>,
    parentSection?: string
  ): Promise<Theorem[]> {
    const prompt = this.buildTheoremExtractionPrompt(section.content, options);
    
    try {
      const response = await (this.aiService as any).client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in extracting theorems, lemmas, and mathematical principles from academic and scientific documents. Identify theoretical statements with high precision and preserve their logical structure.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseTheoremResponse(
        content,
        section,
        startId,
        options,
        parentSection
      );

    } catch (error) {
      Logger.error(`Error extracting theorems from section "${section.heading}":`, error);
      throw error;
    }
  }

  /**
   * Build prompt for formula extraction
   */
  private buildFormulaExtractionPrompt(text: string, options: Required<FormulaExtractionOptions>): string {
    const formulaTypes = options.includeTypes
      .filter(type => !options.excludeTypes.includes(type))
      .join(', ');

    return `Extract mathematical formulas, equations, and expressions from the following text. For each formula, provide:

1. Name (if explicitly mentioned, otherwise "none")
2. Expression (the mathematical formula)
3. LaTeX representation (if possible)
4. Description (what the formula represents)
5. Formula type from: ${formulaTypes}
6. Confidence score (0.0-1.0)
7. Importance level (LOW, MEDIUM, HIGH, CRITICAL)
8. Context (surrounding text)
9. Variables (symbol, description, unit if applicable)
10. Domain (mathematical/scientific field)
11. Applications (if mentioned)
12. Related formulas (if mentioned)

Only include formulas with confidence >= ${options.minConfidence} and importance >= ${options.minImportance}.

Format your response exactly as follows:

FORMULAS:
Name: [formula name or "none"]
Expression: [mathematical expression]
LaTeX: [LaTeX representation or "none"]
Description: [clear description]
Type: [formula type]
Confidence: 0.XX
Importance: [importance level]
Context: [surrounding context]
Variables: [symbol:description:unit; symbol:description:unit; or "none"]
Domain: [mathematical/scientific domain]
Applications: [comma-separated applications, or "none"]
Related: [comma-separated related formulas, or "none"]

Name: [next formula...]
[Continue for all formulas...]

Text to analyze:
${text}`;
  }

  /**
   * Build prompt for theorem extraction
   */
  private buildTheoremExtractionPrompt(text: string, options: Required<TheoremExtractionOptions>): string {
    const theoremTypes = options.includeTypes
      .filter(type => !options.excludeTypes.includes(type))
      .join(', ');

    return `Extract theorems, lemmas, principles, and laws from the following text. For each theorem, provide:

1. Name (the theorem name)
2. Statement (the theorem statement)
3. Proof (if provided, otherwise "none")
4. Theorem type from: ${theoremTypes}
5. Confidence score (0.0-1.0)
6. Importance level (LOW, MEDIUM, HIGH, CRITICAL)
7. Context (surrounding text)
8. Domain (mathematical/scientific field)
9. Prerequisites (required knowledge)
10. Applications (if mentioned)
11. Related theorems (if mentioned)
12. Corollaries (if mentioned)
13. Examples (if provided)

Only include theorems with confidence >= ${options.minConfidence} and importance >= ${options.minImportance}.

Format your response exactly as follows:

THEOREMS:
Name: [theorem name]
Statement: [theorem statement]
Proof: [proof or "none"]
Type: [theorem type]
Confidence: 0.XX
Importance: [importance level]
Context: [surrounding context]
Domain: [mathematical/scientific domain]
Prerequisites: [comma-separated prerequisites, or "none"]
Applications: [comma-separated applications, or "none"]
Related: [comma-separated related theorems, or "none"]
Corollaries: [comma-separated corollaries, or "none"]
Examples: [comma-separated examples, or "none"]

Name: [next theorem...]
[Continue for all theorems...]

Text to analyze:
${text}`;
  }

  /**
   * Parse formula extraction response
   */
  private parseFormulaResponse(
    content: string,
    section: { heading: string; content: string },
    startId: number,
    options: Required<FormulaExtractionOptions>,
    parentSection?: string
  ): Formula[] {
    const formulas: Formula[] = [];
    
    try {
      const formulaBlocks = content.split(/Name:\s*/).filter(block => block.trim());

      for (let i = 0; i < formulaBlocks.length; i++) {
        const block = formulaBlocks[i].trim();
        if (!block) continue;

        const lines = block.split('\n').map(line => line.trim());
        const name = lines[0] && lines[0].toLowerCase() !== 'none' ? lines[0] : undefined;

        const expressionMatch = block.match(/Expression:\s*(.+)/);
        const latexMatch = block.match(/LaTeX:\s*(.+)/);
        const descriptionMatch = block.match(/Description:\s*(.+)/);
        const typeMatch = block.match(/Type:\s*(.+)/);
        const confidenceMatch = block.match(/Confidence:\s*([\d.]+)/);
        const importanceMatch = block.match(/Importance:\s*(.+)/);
        const contextMatch = block.match(/Context:\s*(.+)/);
        const variablesMatch = block.match(/Variables:\s*(.+)/);
        const domainMatch = block.match(/Domain:\s*(.+)/);
        const applicationsMatch = block.match(/Applications:\s*(.+)/);
        const relatedMatch = block.match(/Related:\s*(.+)/);

        if (!expressionMatch || !descriptionMatch || !typeMatch || !confidenceMatch || !importanceMatch) {
          continue;
        }

        const formulaType = typeMatch[1].trim() as FormulaType;
        const confidence = parseFloat(confidenceMatch[1]);
        const importance = importanceMatch[1].trim() as ImportanceLevel;

        // Validate formula type
        if (!this.getAllFormulaTypes().includes(formulaType)) {
          continue;
        }

        // Parse variables
        const variables: Variable[] = [];
        if (variablesMatch && variablesMatch[1].trim().toLowerCase() !== 'none') {
          const variableStrings = variablesMatch[1].split(';');
          for (const varStr of variableStrings) {
            const parts = varStr.split(':').map(p => p.trim());
            if (parts.length >= 2) {
              variables.push({
                symbol: parts[0],
                description: parts[1],
                unit: parts[2] || undefined,
                constraints: parts[3] || undefined
              });
            }
          }
        }

        // Parse applications
        const applications = applicationsMatch && applicationsMatch[1].trim().toLowerCase() !== 'none'
          ? applicationsMatch[1].split(',').map(a => a.trim()).filter(a => a)
          : [];

        // Parse related formulas
        const relatedFormulas = relatedMatch && relatedMatch[1].trim().toLowerCase() !== 'none'
          ? relatedMatch[1].split(',').map(f => f.trim()).filter(f => f)
          : [];

        const formula: Formula = {
          id: `formula_${startId + i}`,
          name,
          expression: expressionMatch[1].trim(),
          latex: latexMatch && latexMatch[1].trim().toLowerCase() !== 'none' ? latexMatch[1].trim() : undefined,
          description: descriptionMatch[1].trim(),
          context: contextMatch ? contextMatch[1].trim() : '',
          confidence,
          importance,
          sourceLocation: {
            section: parentSection ? `${parentSection} > ${section.heading}` : section.heading,
            paragraph: this.estimateParagraphNumber(section.content, 0),
            sentence: this.estimateSentenceNumber(section.content, 0)
          },
          formulaType,
          variables: variables.length > 0 ? variables : undefined,
          domain: domainMatch ? domainMatch[1].trim() : undefined,
          applications: applications.length > 0 ? applications : undefined,
          relatedFormulas: relatedFormulas.length > 0 ? relatedFormulas : undefined
        };

        formulas.push(formula);
      }

    } catch (error) {
      Logger.error('Error parsing formula response:', error);
    }

    return formulas;
  }

  /**
   * Parse theorem extraction response
   */
  private parseTheoremResponse(
    content: string,
    section: { heading: string; content: string },
    startId: number,
    options: Required<TheoremExtractionOptions>,
    parentSection?: string
  ): Theorem[] {
    const theorems: Theorem[] = [];
    
    try {
      const theoremBlocks = content.split(/Name:\s*/).filter(block => block.trim());

      for (let i = 0; i < theoremBlocks.length; i++) {
        const block = theoremBlocks[i].trim();
        if (!block) continue;

        const lines = block.split('\n').map(line => line.trim());
        const name = lines[0];

        if (!name) continue;

        const statementMatch = block.match(/Statement:\s*(.+)/);
        const proofMatch = block.match(/Proof:\s*(.+)/);
        const typeMatch = block.match(/Type:\s*(.+)/);
        const confidenceMatch = block.match(/Confidence:\s*([\d.]+)/);
        const importanceMatch = block.match(/Importance:\s*(.+)/);
        const contextMatch = block.match(/Context:\s*(.+)/);
        const domainMatch = block.match(/Domain:\s*(.+)/);
        const prerequisitesMatch = block.match(/Prerequisites:\s*(.+)/);
        const applicationsMatch = block.match(/Applications:\s*(.+)/);
        const relatedMatch = block.match(/Related:\s*(.+)/);
        const corollariesMatch = block.match(/Corollaries:\s*(.+)/);
        const examplesMatch = block.match(/Examples:\s*(.+)/);

        if (!statementMatch || !typeMatch || !confidenceMatch || !importanceMatch) {
          continue;
        }

        const theoremType = typeMatch[1].trim() as TheoremType;
        const confidence = parseFloat(confidenceMatch[1]);
        const importance = importanceMatch[1].trim() as ImportanceLevel;

        // Validate theorem type
        if (!this.getAllTheoremTypes().includes(theoremType)) {
          continue;
        }

        // Parse prerequisites
        const prerequisites = prerequisitesMatch && prerequisitesMatch[1].trim().toLowerCase() !== 'none'
          ? prerequisitesMatch[1].split(',').map(p => p.trim()).filter(p => p)
          : [];

        // Parse applications
        const applications = applicationsMatch && applicationsMatch[1].trim().toLowerCase() !== 'none'
          ? applicationsMatch[1].split(',').map(a => a.trim()).filter(a => a)
          : [];

        // Parse related theorems
        const relatedTheorems = relatedMatch && relatedMatch[1].trim().toLowerCase() !== 'none'
          ? relatedMatch[1].split(',').map(t => t.trim()).filter(t => t)
          : [];

        // Parse corollaries
        const corollaries = corollariesMatch && corollariesMatch[1].trim().toLowerCase() !== 'none'
          ? corollariesMatch[1].split(',').map(c => c.trim()).filter(c => c)
          : [];

        // Parse examples
        const examples = examplesMatch && examplesMatch[1].trim().toLowerCase() !== 'none'
          ? examplesMatch[1].split(',').map(e => e.trim()).filter(e => e)
          : [];

        const theorem: Theorem = {
          id: `theorem_${startId + i}`,
          name,
          statement: statementMatch[1].trim(),
          proof: proofMatch && proofMatch[1].trim().toLowerCase() !== 'none' ? proofMatch[1].trim() : undefined,
          context: contextMatch ? contextMatch[1].trim() : '',
          confidence,
          importance,
          sourceLocation: {
            section: parentSection ? `${parentSection} > ${section.heading}` : section.heading,
            paragraph: this.estimateParagraphNumber(section.content, 0),
            sentence: this.estimateSentenceNumber(section.content, 0)
          },
          theoremType,
          domain: domainMatch ? domainMatch[1].trim() : 'General',
          prerequisites: prerequisites.length > 0 ? prerequisites : undefined,
          applications: applications.length > 0 ? applications : undefined,
          relatedTheorems: relatedTheorems.length > 0 ? relatedTheorems : undefined,
          corollaries: corollaries.length > 0 ? corollaries : undefined,
          examples: examples.length > 0 ? examples : undefined
        };

        theorems.push(theorem);
      }

    } catch (error) {
      Logger.error('Error parsing theorem response:', error);
    }

    return theorems;
  }

  /**
   * Filter formulas based on options
   */
  private filterFormulas(formulas: Formula[], options: Required<FormulaExtractionOptions>): Formula[] {
    return formulas.filter(formula => {
      if (formula.confidence < options.minConfidence) return false;

      const importanceLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const minImportanceIndex = importanceLevels.indexOf(options.minImportance);
      const formulaImportanceIndex = importanceLevels.indexOf(formula.importance);
      
      if (formulaImportanceIndex < minImportanceIndex) return false;

      if (options.excludeTypes.includes(formula.formulaType)) return false;

      if (options.includeTypes.length > 0 && !options.includeTypes.includes(formula.formulaType)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Filter theorems based on options
   */
  private filterTheorems(theorems: Theorem[], options: Required<TheoremExtractionOptions>): Theorem[] {
    return theorems.filter(theorem => {
      if (theorem.confidence < options.minConfidence) return false;

      const importanceLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const minImportanceIndex = importanceLevels.indexOf(options.minImportance);
      const theoremImportanceIndex = importanceLevels.indexOf(theorem.importance);
      
      if (theoremImportanceIndex < minImportanceIndex) return false;

      if (options.excludeTypes.includes(theorem.theoremType)) return false;

      if (options.includeTypes.length > 0 && !options.includeTypes.includes(theorem.theoremType)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Deduplicate formulas
   */
  private deduplicateFormulas(formulas: Formula[]): Formula[] {
    const seen = new Map<string, Formula>();
    
    for (const formula of formulas) {
      const key = formula.expression.toLowerCase().replace(/\s+/g, '');
      const existing = seen.get(key);
      
      if (!existing || formula.confidence > existing.confidence) {
        seen.set(key, formula);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Deduplicate theorems
   */
  private deduplicateTheorems(theorems: Theorem[]): Theorem[] {
    const seen = new Map<string, Theorem>();
    
    for (const theorem of theorems) {
      const key = theorem.name.toLowerCase();
      const existing = seen.get(key);
      
      if (!existing || theorem.confidence > existing.confidence) {
        seen.set(key, theorem);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Store formulas in MongoDB
   */
  private async storeFormulas(documentId: string, userId: string, formulas: Formula[]): Promise<void> {
    try {
      for (const formula of formulas) {
        const knowledgeElement: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'> = {
          document_id: documentId,
          user_id: userId,
          agent_type: 'extraction',
          element_type: 'formula',
          content: {
            title: formula.name || formula.expression,
            body: `${formula.description}\n\nExpression: ${formula.expression}${formula.latex ? `\nLaTeX: ${formula.latex}` : ''}`,
            metadata: {
              name: formula.name,
              expression: formula.expression,
              latex: formula.latex,
              formulaType: formula.formulaType,
              confidence: formula.confidence,
              importance: formula.importance,
              context: formula.context,
              variables: formula.variables,
              domain: formula.domain,
              applications: formula.applications,
              relatedFormulas: formula.relatedFormulas
            }
          },
          source_location: {
            section: formula.sourceLocation.section,
            position: {
              paragraph: formula.sourceLocation.paragraph,
              sentence: formula.sourceLocation.sentence
            }
          },
          tags: [formula.formulaType.toLowerCase(), formula.importance.toLowerCase(), 'formula', 'extraction'],
          confidence_score: formula.confidence
        };

        await mongoConnection.insertKnowledgeElement(knowledgeElement);
      }

      Logger.info(`Stored ${formulas.length} formulas for document ${documentId}`);
    } catch (error) {
      Logger.error(`Error storing formulas for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Store theorems in MongoDB
   */
  private async storeTheorems(documentId: string, userId: string, theorems: Theorem[]): Promise<void> {
    try {
      for (const theorem of theorems) {
        const knowledgeElement: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'> = {
          document_id: documentId,
          user_id: userId,
          agent_type: 'extraction',
          element_type: 'theorem',
          content: {
            title: theorem.name,
            body: `${theorem.statement}${theorem.proof ? `\n\nProof: ${theorem.proof}` : ''}`,
            metadata: {
              statement: theorem.statement,
              proof: theorem.proof,
              theoremType: theorem.theoremType,
              confidence: theorem.confidence,
              importance: theorem.importance,
              context: theorem.context,
              domain: theorem.domain,
              prerequisites: theorem.prerequisites,
              applications: theorem.applications,
              relatedTheorems: theorem.relatedTheorems,
              corollaries: theorem.corollaries,
              examples: theorem.examples
            }
          },
          source_location: {
            section: theorem.sourceLocation.section,
            position: {
              paragraph: theorem.sourceLocation.paragraph,
              sentence: theorem.sourceLocation.sentence
            }
          },
          tags: [theorem.theoremType.toLowerCase(), theorem.importance.toLowerCase(), 'theorem', 'extraction'],
          confidence_score: theorem.confidence
        };

        await mongoConnection.insertKnowledgeElement(knowledgeElement);
      }

      Logger.info(`Stored ${theorems.length} theorems for document ${documentId}`);
    } catch (error) {
      Logger.error(`Error storing theorems for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Group formulas by type
   */
  private groupFormulasByType(formulas: Formula[]): Record<FormulaType, number> {
    const grouped: Record<FormulaType, number> = {} as Record<FormulaType, number>;
    
    for (const formula of formulas) {
      grouped[formula.formulaType] = (grouped[formula.formulaType] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Group theorems by type
   */
  private groupTheoremsByType(theorems: Theorem[]): Record<TheoremType, number> {
    const grouped: Record<TheoremType, number> = {} as Record<TheoremType, number>;
    
    for (const theorem of theorems) {
      grouped[theorem.theoremType] = (grouped[theorem.theoremType] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Calculate overall formula confidence
   */
  private calculateFormulaConfidence(formulas: Formula[]): number {
    if (formulas.length === 0) return 0;
    
    const totalConfidence = formulas.reduce((sum, formula) => sum + formula.confidence, 0);
    return totalConfidence / formulas.length;
  }

  /**
   * Calculate overall theorem confidence
   */
  private calculateTheoremConfidence(theorems: Theorem[]): number {
    if (theorems.length === 0) return 0;
    
    const totalConfidence = theorems.reduce((sum, theorem) => sum + theorem.confidence, 0);
    return totalConfidence / theorems.length;
  }

  /**
   * Get all available formula types
   */
  private getAllFormulaTypes(): FormulaType[] {
    return [
      'EQUATION', 'INEQUALITY', 'FUNCTION', 'IDENTITY', 'THEOREM', 'LEMMA',
      'COROLLARY', 'DEFINITION', 'AXIOM', 'FORMULA', 'EXPRESSION', 'PROOF',
      'ALGORITHM', 'STATISTICAL', 'PHYSICAL', 'CHEMICAL', 'ECONOMIC', 'GENERAL'
    ];
  }

  /**
   * Get all available theorem types
   */
  private getAllTheoremTypes(): TheoremType[] {
    return [
      'THEOREM', 'LEMMA', 'COROLLARY', 'PROPOSITION', 'AXIOM', 'POSTULATE',
      'PRINCIPLE', 'LAW', 'RULE', 'PROPERTY', 'CONJECTURE', 'HYPOTHESIS',
      'DEFINITION', 'GENERAL'
    ];
  }

  /**
   * Get existing knowledge elements for relationship extraction
   */
  private async getExistingKnowledgeElements(documentId: string): Promise<KnowledgeElement[]> {
    try {
      const filter: any = {
        document_id: documentId,
        agent_type: 'extraction',
        element_type: { $in: ['entity', 'concept', 'definition', 'formula', 'theorem'] }
      };

      return await mongoConnection.findKnowledgeElements(filter, {
        sort: { confidence_score: -1 }
      });
    } catch (error) {
      Logger.error(`Error retrieving existing knowledge elements for document ${documentId}:`, error);
      return [];
    }
  }

  /**
   * Extract relationships from a single section
   */
  private async extractRelationshipsFromSection(
    section: { heading: string; content: string },
    knowledgeElements: KnowledgeElement[],
    startId: number,
    options: Required<RelationshipExtractionOptions>,
    parentSection?: string
  ): Promise<Relationship[]> {
    const prompt = this.buildRelationshipExtractionPrompt(section.content, knowledgeElements, options);
    
    try {
      const response = await (this.aiService as any).client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in identifying relationships between entities, concepts, definitions, formulas, and theorems in academic and scientific documents. Extract meaningful relationships with high precision.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from AI service');
      }

      return this.parseRelationshipResponse(
        content,
        section,
        startId,
        options,
        parentSection
      );

    } catch (error) {
      Logger.error(`Error extracting relationships from section "${section.heading}":`, error);
      throw error;
    }
  }

  /**
   * Build prompt for relationship extraction
   */
  private buildRelationshipExtractionPrompt(
    text: string, 
    knowledgeElements: KnowledgeElement[], 
    options: Required<RelationshipExtractionOptions>
  ): string {
    const relationshipTypes = options.includeTypes
      .filter(type => !options.excludeTypes.includes(type))
      .join(', ');

    // Create a list of available entities/concepts for relationship extraction
    const availableElements = knowledgeElements.map(el => ({
      title: el.content.title,
      type: el.element_type
    }));

    const elementsList = availableElements
      .map(el => `${el.title} (${el.type})`)
      .join(', ');

    return `Extract relationships between the following known entities, concepts, definitions, formulas, and theorems from the text:

AVAILABLE ELEMENTS: ${elementsList}

For each relationship found in the text, provide:

1. Source entity (must be from available elements)
2. Target entity (must be from available elements)
3. Relationship type from: ${relationshipTypes}
4. Description (brief explanation of the relationship)
5. Context (surrounding text that supports the relationship)
6. Confidence score (0.0-1.0)
7. Importance level (LOW, MEDIUM, HIGH, CRITICAL)
8. Direction (DIRECTED, BIDIRECTIONAL, UNDIRECTED)
9. Strength (0.0-1.0 indicating relationship strength)
10. Evidence (supporting phrases from the text)

Only include relationships with confidence >= ${options.minConfidence}, importance >= ${options.minImportance}, and strength >= ${options.minStrength}.

Format your response exactly as follows:

RELATIONSHIPS:
Source: [source entity name]
Target: [target entity name]
Type: [relationship type]
Description: [brief description]
Context: [surrounding context]
Confidence: 0.XX
Importance: [importance level]
Direction: [direction type]
Strength: 0.XX
Evidence: [semicolon-separated evidence phrases]

Source: [next relationship...]
[Continue for all relationships...]

Text to analyze:
${text}`;
  }

  /**
   * Parse relationship extraction response
   */
  private parseRelationshipResponse(
    content: string,
    section: { heading: string; content: string },
    startId: number,
    options: Required<RelationshipExtractionOptions>,
    parentSection?: string
  ): Relationship[] {
    const relationships: Relationship[] = [];
    
    try {
      const relationshipBlocks = content.split(/Source:\s*/).filter(block => block.trim());

      for (let i = 0; i < relationshipBlocks.length; i++) {
        const block = relationshipBlocks[i].trim();
        if (!block) continue;

        const lines = block.split('\n').map(line => line.trim());
        const sourceEntity = lines[0];

        if (!sourceEntity) continue;

        const targetMatch = block.match(/Target:\s*(.+)/);
        const typeMatch = block.match(/Type:\s*(.+)/);
        const descriptionMatch = block.match(/Description:\s*(.+)/);
        const contextMatch = block.match(/Context:\s*(.+)/);
        const confidenceMatch = block.match(/Confidence:\s*([\d.]+)/);
        const importanceMatch = block.match(/Importance:\s*(.+)/);
        const directionMatch = block.match(/Direction:\s*(.+)/);
        const strengthMatch = block.match(/Strength:\s*([\d.]+)/);
        const evidenceMatch = block.match(/Evidence:\s*(.+)/);

        if (!targetMatch || !typeMatch || !descriptionMatch || !confidenceMatch || !importanceMatch) {
          continue;
        }

        const relationshipType = typeMatch[1].trim() as RelationshipType;
        const confidence = parseFloat(confidenceMatch[1]);
        const importance = importanceMatch[1].trim() as ImportanceLevel;
        const direction = (directionMatch ? directionMatch[1].trim() : 'DIRECTED') as RelationshipDirection;
        const strength = strengthMatch ? parseFloat(strengthMatch[1]) : 0.5;

        // Validate relationship type
        if (!this.getAllRelationshipTypes().includes(relationshipType)) {
          continue;
        }

        // Validate direction
        if (!['DIRECTED', 'BIDIRECTIONAL', 'UNDIRECTED'].includes(direction)) {
          continue;
        }

        // Parse evidence
        const evidence = evidenceMatch 
          ? evidenceMatch[1].split(';').map(e => e.trim()).filter(e => e)
          : [];

        const relationship: Relationship = {
          id: `rel_${startId + i}`,
          sourceEntity,
          targetEntity: targetMatch[1].trim(),
          relationshipType,
          description: descriptionMatch[1].trim(),
          context: contextMatch ? contextMatch[1].trim() : '',
          confidence,
          importance,
          sourceLocation: {
            section: parentSection ? `${parentSection} > ${section.heading}` : section.heading,
            paragraph: this.estimateParagraphNumber(section.content, 0),
            sentence: this.estimateSentenceNumber(section.content, 0)
          },
          direction,
          strength,
          evidence
        };

        relationships.push(relationship);
      }

    } catch (error) {
      Logger.error('Error parsing relationship response:', error);
    }

    return relationships;
  }

  /**
   * Filter relationships based on options
   */
  private filterRelationships(relationships: Relationship[], options: Required<RelationshipExtractionOptions>): Relationship[] {
    return relationships.filter(relationship => {
      if (relationship.confidence < options.minConfidence) return false;
      if (relationship.strength < options.minStrength) return false;

      const importanceLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const minImportanceIndex = importanceLevels.indexOf(options.minImportance);
      const relationshipImportanceIndex = importanceLevels.indexOf(relationship.importance);
      
      if (relationshipImportanceIndex < minImportanceIndex) return false;

      if (options.excludeTypes.includes(relationship.relationshipType)) return false;

      if (options.includeTypes.length > 0 && !options.includeTypes.includes(relationship.relationshipType)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Deduplicate relationships
   */
  private deduplicateRelationships(relationships: Relationship[]): Relationship[] {
    const seen = new Map<string, Relationship>();
    
    for (const relationship of relationships) {
      const key = `${relationship.sourceEntity.toLowerCase()}_${relationship.targetEntity.toLowerCase()}_${relationship.relationshipType}`;
      const existing = seen.get(key);
      
      if (!existing || relationship.confidence > existing.confidence) {
        seen.set(key, relationship);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Limit relationships per entity
   */
  private limitRelationshipsPerEntity(relationships: Relationship[], maxPerEntity: number): Relationship[] {
    const entityCounts = new Map<string, number>();
    const filteredRelationships: Relationship[] = [];

    // Sort by confidence to keep the best relationships
    const sortedRelationships = relationships.sort((a, b) => b.confidence - a.confidence);

    for (const relationship of sortedRelationships) {
      const sourceCount = entityCounts.get(relationship.sourceEntity) || 0;
      const targetCount = entityCounts.get(relationship.targetEntity) || 0;

      if (sourceCount < maxPerEntity && targetCount < maxPerEntity) {
        filteredRelationships.push(relationship);
        entityCounts.set(relationship.sourceEntity, sourceCount + 1);
        entityCounts.set(relationship.targetEntity, targetCount + 1);
      }
    }

    return filteredRelationships;
  }

  /**
   * Store relationships in MongoDB
   */
  private async storeRelationships(documentId: string, userId: string, relationships: Relationship[]): Promise<void> {
    try {
      for (const relationship of relationships) {
        const knowledgeElement: Omit<KnowledgeElement, '_id' | 'created_at' | 'updated_at'> = {
          document_id: documentId,
          user_id: userId,
          agent_type: 'extraction',
          element_type: 'relationship',
          content: {
            title: `${relationship.sourceEntity} ${relationship.relationshipType} ${relationship.targetEntity}`,
            body: relationship.description,
            metadata: {
              sourceEntity: relationship.sourceEntity,
              targetEntity: relationship.targetEntity,
              relationshipType: relationship.relationshipType,
              confidence: relationship.confidence,
              importance: relationship.importance,
              context: relationship.context,
              direction: relationship.direction,
              strength: relationship.strength,
              evidence: relationship.evidence
            }
          },
          source_location: {
            section: relationship.sourceLocation.section,
            position: {
              paragraph: relationship.sourceLocation.paragraph,
              sentence: relationship.sourceLocation.sentence
            }
          },
          tags: [relationship.relationshipType.toLowerCase(), relationship.importance.toLowerCase(), 'relationship', 'extraction'],
          confidence_score: relationship.confidence
        };

        await mongoConnection.insertKnowledgeElement(knowledgeElement);
      }

      Logger.info(`Stored ${relationships.length} relationships for document ${documentId}`);
    } catch (error) {
      Logger.error(`Error storing relationships for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Build knowledge graph from relationships and entities
   */
  private async buildKnowledgeGraph(
    documentId: string, 
    knowledgeElements: KnowledgeElement[], 
    relationships: Relationship[]
  ): Promise<KnowledgeGraph> {
    try {
      // Create nodes from knowledge elements
      const nodes: KnowledgeNode[] = knowledgeElements.map(element => ({
        id: element._id || element.content.title,
        label: element.content.title,
        type: element.element_type as KnowledgeNode['type'],
        properties: {
          description: element.content.body,
          section: element.source_location.section,
          tags: element.tags,
          ...element.content.metadata
        },
        importance: (element.content.metadata?.importance || 'LOW') as ImportanceLevel,
        confidence: element.confidence_score || 0
      }));

      // Create edges from relationships
      const edges: KnowledgeEdge[] = relationships.map(relationship => ({
        id: relationship.id,
        source: relationship.sourceEntity,
        target: relationship.targetEntity,
        type: relationship.relationshipType,
        label: relationship.description,
        properties: {
          context: relationship.context,
          evidence: relationship.evidence,
          section: relationship.sourceLocation.section
        },
        weight: relationship.strength,
        confidence: relationship.confidence,
        direction: relationship.direction
      }));

      // Calculate metadata
      const nodeTypes: Record<string, number> = {};
      for (const node of nodes) {
        nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
      }

      const relationshipTypes: Record<RelationshipType, number> = {} as Record<RelationshipType, number>;
      for (const relationship of relationships) {
        relationshipTypes[relationship.relationshipType] = (relationshipTypes[relationship.relationshipType] || 0) + 1;
      }

      const totalConfidence = [...nodes, ...edges].reduce((sum, item) => sum + item.confidence, 0);
      const averageConfidence = totalConfidence / (nodes.length + edges.length);

      const entitiesWithRelationships = new Set([
        ...relationships.map(r => r.sourceEntity),
        ...relationships.map(r => r.targetEntity)
      ]);
      const coverage = entitiesWithRelationships.size / nodes.length;

      return {
        nodes,
        edges,
        metadata: {
          totalNodes: nodes.length,
          totalEdges: edges.length,
          nodeTypes,
          relationshipTypes,
          confidence: averageConfidence,
          coverage
        }
      };

    } catch (error) {
      Logger.error(`Error building knowledge graph for document ${documentId}:`, error);
      return {
        nodes: [],
        edges: [],
        metadata: {
          totalNodes: 0,
          totalEdges: 0,
          nodeTypes: {},
          relationshipTypes: {} as Record<RelationshipType, number>,
          confidence: 0,
          coverage: 0
        }
      };
    }
  }

  /**
   * Group relationships by type
   */
  private groupRelationshipsByType(relationships: Relationship[]): Record<RelationshipType, number> {
    const grouped: Record<RelationshipType, number> = {} as Record<RelationshipType, number>;
    
    for (const relationship of relationships) {
      grouped[relationship.relationshipType] = (grouped[relationship.relationshipType] || 0) + 1;
    }
    
    return grouped;
  }

  /**
   * Calculate overall relationship confidence
   */
  private calculateRelationshipConfidence(relationships: Relationship[]): number {
    if (relationships.length === 0) return 0;
    
    const totalConfidence = relationships.reduce((sum, rel) => sum + rel.confidence, 0);
    return totalConfidence / relationships.length;
  }

  /**
   * Get all available relationship types
   */
  private getAllRelationshipTypes(): RelationshipType[] {
    return [
      'IS_A', 'PART_OF', 'CAUSES', 'ENABLES', 'REQUIRES', 'SIMILAR_TO', 'OPPOSITE_TO',
      'RELATED_TO', 'DERIVES_FROM', 'APPLIES_TO', 'INFLUENCES', 'CONTAINS', 'USES',
      'IMPLEMENTS', 'EXTENDS', 'PRECEDES', 'FOLLOWS', 'EQUIVALENT_TO', 'CONTRADICTS',
      'SUPPORTS', 'GENERAL'
    ];
  }

  /**
   * Extract formulas from structured text
   */
  async extractFormulas(
    documentId: string,
    userId: string,
    structuredText: StructuredText,
    options: FormulaExtractionOptions = {}
  ): Promise<FormulaExtractionResult> {
    const startTime = Date.now();
    
    try {
      Logger.info(`Starting formula extraction for document ${documentId}`);

      // Set default options
      const opts: Required<FormulaExtractionOptions> = {
        includeTypes: options.includeTypes || this.getAllFormulaTypes(),
        excludeTypes: options.excludeTypes || [],
        minConfidence: options.minConfidence || 0.6,
        minImportance: options.minImportance || 'LOW',
        includeLatex: options.includeLatex !== false,
        includeVariables: options.includeVariables !== false,
        includeApplications: options.includeApplications !== false,
        includeRelatedFormulas: options.includeRelatedFormulas !== false,
        deduplication: options.deduplication !== false,
      };

      // Extract formulas from each section
      const allFormulas: Formula[] = [];
      let formulaIdCounter = 1;

      for (const section of structuredText.sections) {
        const sectionFormulas = await this.extractFormulasFromSection(
          section,
          formulaIdCounter,
          opts
        );
        allFormulas.push(...sectionFormulas);
        formulaIdCounter += sectionFormulas.length;

        // Process subsections if they exist
        if (section.subsections) {
          for (const subsection of section.subsections) {
            const subsectionFormulas = await this.extractFormulasFromSection(
              { heading: subsection.heading, content: subsection.content },
              formulaIdCounter,
              opts,
              section.heading
            );
            allFormulas.push(...subsectionFormulas);
            formulaIdCounter += subsectionFormulas.length;
          }
        }
      }

      // Filter formulas based on options
      let filteredFormulas = this.filterFormulas(allFormulas, opts);

      // Deduplicate if requested
      if (opts.deduplication) {
        filteredFormulas = this.deduplicateFormulas(filteredFormulas);
      }

      // Store formulas in MongoDB
      await this.storeFormulas(documentId, userId, filteredFormulas);

      const processingTime = Date.now() - startTime;
      const formulasByType = this.groupFormulasByType(filteredFormulas);

      const result: FormulaExtractionResult = {
        formulas: filteredFormulas,
        totalFormulas: filteredFormulas.length,
        formulasByType,
        confidence: this.calculateFormulaConfidence(filteredFormulas),
        processingTime
      };

      Logger.info(`Formula extraction completed for document ${documentId}. Found ${filteredFormulas.length} formulas in ${processingTime}ms`);
      return result;

    } catch (error) {
      Logger.error(`Error in formula extraction for document ${documentId}:`, error);
      throw new Error(`Failed to extract formulas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract theorems from structured text
   */
  async extractTheorems(
    documentId: string,
    userId: string,
    structuredText: StructuredText,
    options: TheoremExtractionOptions = {}
  ): Promise<TheoremExtractionResult> {
    const startTime = Date.now();
    
    try {
      Logger.info(`Starting theorem extraction for document ${documentId}`);

      // Set default options
      const opts: Required<TheoremExtractionOptions> = {
        includeTypes: options.includeTypes || this.getAllTheoremTypes(),
        excludeTypes: options.excludeTypes || [],
        minConfidence: options.minConfidence || 0.6,
        minImportance: options.minImportance || 'LOW',
        includeProof: options.includeProof !== false,
        includePrerequisites: options.includePrerequisites !== false,
        includeApplications: options.includeApplications !== false,
        includeRelatedTheorems: options.includeRelatedTheorems !== false,
        includeCorollaries: options.includeCorollaries !== false,
        includeExamples: options.includeExamples !== false,
        deduplication: options.deduplication !== false,
      };

      // Extract theorems from each section
      const allTheorems: Theorem[] = [];
      let theoremIdCounter = 1;

      for (const section of structuredText.sections) {
        const sectionTheorems = await this.extractTheoremsFromSection(
          section,
          theoremIdCounter,
          opts
        );
        allTheorems.push(...sectionTheorems);
        theoremIdCounter += sectionTheorems.length;

        // Process subsections if they exist
        if (section.subsections) {
          for (const subsection of section.subsections) {
            const subsectionTheorems = await this.extractTheoremsFromSection(
              { heading: subsection.heading, content: subsection.content },
              theoremIdCounter,
              opts,
              section.heading
            );
            allTheorems.push(...subsectionTheorems);
            theoremIdCounter += subsectionTheorems.length;
          }
        }
      }

      // Filter theorems based on options
      let filteredTheorems = this.filterTheorems(allTheorems, opts);

      // Deduplicate if requested
      if (opts.deduplication) {
        filteredTheorems = this.deduplicateTheorems(filteredTheorems);
      }

      // Store theorems in MongoDB
      await this.storeTheorems(documentId, userId, filteredTheorems);

      const processingTime = Date.now() - startTime;
      const theoremsByType = this.groupTheoremsByType(filteredTheorems);

      const result: TheoremExtractionResult = {
        theorems: filteredTheorems,
        totalTheorems: filteredTheorems.length,
        theoremsByType,
        confidence: this.calculateTheoremConfidence(filteredTheorems),
        processingTime
      };

      Logger.info(`Theorem extraction completed for document ${documentId}. Found ${filteredTheorems.length} theorems in ${processingTime}ms`);
      return result;

    } catch (error) {
      Logger.error(`Error in theorem extraction for document ${documentId}:`, error);
      throw new Error(`Failed to extract theorems: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get definitions by document ID
   */
  async getDefinitionsByDocument(documentId: string, options?: {
    types?: DefinitionType[];
    minConfidence?: number;
    limit?: number;
  }): Promise<Definition[]> {
    try {
      const filter: any = {
        document_id: documentId,
        agent_type: 'extraction',
        element_type: 'definition'
      };

      if (options?.minConfidence) {
        filter.confidence_score = { $gte: options.minConfidence };
      }

      const knowledgeElements = await mongoConnection.findKnowledgeElements(filter, {
        limit: options?.limit,
        sort: { confidence_score: -1 }
      });

      return knowledgeElements.map(this.knowledgeElementToDefinition.bind(this));
    } catch (error) {
      Logger.error(`Error retrieving definitions for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Get concepts by document ID
   */
  async getConceptsByDocument(documentId: string, options?: {
    categories?: ConceptCategory[];
    minConfidence?: number;
    limit?: number;
  }): Promise<Concept[]> {
    try {
      const filter: any = {
        document_id: documentId,
        agent_type: 'extraction',
        element_type: 'concept'
      };

      if (options?.minConfidence) {
        filter.confidence_score = { $gte: options.minConfidence };
      }

      const knowledgeElements = await mongoConnection.findKnowledgeElements(filter, {
        limit: options?.limit,
        sort: { confidence_score: -1 }
      });

      return knowledgeElements.map(this.knowledgeElementToConcept.bind(this));
    } catch (error) {
      Logger.error(`Error retrieving concepts for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Search definitions by text
   */
  async searchDefinitions(searchText: string, documentId?: string): Promise<Definition[]> {
    try {
      const filter: any = {
        agent_type: 'extraction',
        element_type: 'definition'
      };

      if (documentId) {
        filter.document_id = documentId;
      }

      const knowledgeElements = await mongoConnection.searchKnowledgeElements(searchText, filter);
      return knowledgeElements.map(this.knowledgeElementToDefinition.bind(this));
    } catch (error) {
      Logger.error(`Error searching definitions with text "${searchText}":`, error);
      throw error;
    }
  }

  /**
   * Get formulas by document ID
   */
  async getFormulasByDocument(documentId: string, options?: {
    types?: FormulaType[];
    minConfidence?: number;
    limit?: number;
  }): Promise<Formula[]> {
    try {
      const filter: any = {
        document_id: documentId,
        agent_type: 'extraction',
        element_type: 'formula'
      };

      if (options?.minConfidence) {
        filter.confidence_score = { $gte: options.minConfidence };
      }

      const knowledgeElements = await mongoConnection.findKnowledgeElements(filter, {
        limit: options?.limit,
        sort: { confidence_score: -1 }
      });

      return knowledgeElements.map(this.knowledgeElementToFormula.bind(this));
    } catch (error) {
      Logger.error(`Error retrieving formulas for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Get theorems by document ID
   */
  async getTheoremsByDocument(documentId: string, options?: {
    types?: TheoremType[];
    minConfidence?: number;
    limit?: number;
  }): Promise<Theorem[]> {
    try {
      const filter: any = {
        document_id: documentId,
        agent_type: 'extraction',
        element_type: 'theorem'
      };

      if (options?.minConfidence) {
        filter.confidence_score = { $gte: options.minConfidence };
      }

      const knowledgeElements = await mongoConnection.findKnowledgeElements(filter, {
        limit: options?.limit,
        sort: { confidence_score: -1 }
      });

      return knowledgeElements.map(this.knowledgeElementToTheorem.bind(this));
    } catch (error) {
      Logger.error(`Error retrieving theorems for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Search formulas by text
   */
  async searchFormulas(searchText: string, documentId?: string): Promise<Formula[]> {
    try {
      const filter: any = {
        agent_type: 'extraction',
        element_type: 'formula'
      };

      if (documentId) {
        filter.document_id = documentId;
      }

      const knowledgeElements = await mongoConnection.searchKnowledgeElements(searchText, filter);
      return knowledgeElements.map(this.knowledgeElementToFormula.bind(this));
    } catch (error) {
      Logger.error(`Error searching formulas with text "${searchText}":`, error);
      throw error;
    }
  }

  /**
   * Extract relationships between entities from structured text
   */
  async extractRelationships(
    documentId: string,
    userId: string,
    structuredText: StructuredText,
    options: RelationshipExtractionOptions = {}
  ): Promise<RelationshipExtractionResult> {
    const startTime = Date.now();
    
    try {
      Logger.info(`Starting relationship extraction for document ${documentId}`);

      // Set default options
      const opts: Required<RelationshipExtractionOptions> = {
        includeTypes: options.includeTypes || this.getAllRelationshipTypes(),
        excludeTypes: options.excludeTypes || [],
        minConfidence: options.minConfidence || 0.6,
        minImportance: options.minImportance || 'LOW',
        minStrength: options.minStrength || 0.3,
        includeEvidence: options.includeEvidence !== false,
        buildKnowledgeGraph: options.buildKnowledgeGraph !== false,
        deduplication: options.deduplication !== false,
        maxRelationshipsPerEntity: options.maxRelationshipsPerEntity || 10,
      };

      // First, get existing entities, concepts, definitions, formulas, and theorems
      const existingKnowledgeElements = await this.getExistingKnowledgeElements(documentId);
      
      if (existingKnowledgeElements.length === 0) {
        Logger.warn(`No existing knowledge elements found for document ${documentId}. Cannot extract relationships.`);
        return {
          relationships: [],
          totalRelationships: 0,
          relationshipsByType: {} as Record<RelationshipType, number>,
          knowledgeGraph: {
            nodes: [],
            edges: [],
            metadata: {
              totalNodes: 0,
              totalEdges: 0,
              nodeTypes: {},
              relationshipTypes: {} as Record<RelationshipType, number>,
              confidence: 0,
              coverage: 0
            }
          },
          confidence: 0,
          processingTime: Date.now() - startTime
        };
      }

      // Extract relationships from each section
      const allRelationships: Relationship[] = [];
      let relationshipIdCounter = 1;

      for (const section of structuredText.sections) {
        const sectionRelationships = await this.extractRelationshipsFromSection(
          section,
          existingKnowledgeElements,
          relationshipIdCounter,
          opts
        );
        allRelationships.push(...sectionRelationships);
        relationshipIdCounter += sectionRelationships.length;

        // Process subsections if they exist
        if (section.subsections) {
          for (const subsection of section.subsections) {
            const subsectionRelationships = await this.extractRelationshipsFromSection(
              { heading: subsection.heading, content: subsection.content },
              existingKnowledgeElements,
              relationshipIdCounter,
              opts,
              section.heading
            );
            allRelationships.push(...subsectionRelationships);
            relationshipIdCounter += subsectionRelationships.length;
          }
        }
      }

      // Filter relationships based on options
      let filteredRelationships = this.filterRelationships(allRelationships, opts);

      // Deduplicate if requested
      if (opts.deduplication) {
        filteredRelationships = this.deduplicateRelationships(filteredRelationships);
      }

      // Limit relationships per entity if specified
      if (opts.maxRelationshipsPerEntity > 0) {
        filteredRelationships = this.limitRelationshipsPerEntity(filteredRelationships, opts.maxRelationshipsPerEntity);
      }

      // Store relationships in MongoDB
      await this.storeRelationships(documentId, userId, filteredRelationships);

      // Build knowledge graph if requested
      const knowledgeGraph = opts.buildKnowledgeGraph 
        ? await this.buildKnowledgeGraph(documentId, existingKnowledgeElements, filteredRelationships)
        : {
            nodes: [],
            edges: [],
            metadata: {
              totalNodes: 0,
              totalEdges: 0,
              nodeTypes: {},
              relationshipTypes: {} as Record<RelationshipType, number>,
              confidence: 0,
              coverage: 0
            }
          };

      const processingTime = Date.now() - startTime;
      const relationshipsByType = this.groupRelationshipsByType(filteredRelationships);

      const result: RelationshipExtractionResult = {
        relationships: filteredRelationships,
        totalRelationships: filteredRelationships.length,
        relationshipsByType,
        knowledgeGraph,
        confidence: this.calculateRelationshipConfidence(filteredRelationships),
        processingTime
      };

      Logger.info(`Relationship extraction completed for document ${documentId}. Found ${filteredRelationships.length} relationships in ${processingTime}ms`);
      return result;

    } catch (error) {
      Logger.error(`Error in relationship extraction for document ${documentId}:`, error);
      throw new Error(`Failed to extract relationships: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search theorems by text
   */
  async searchTheorems(searchText: string, documentId?: string): Promise<Theorem[]> {
    try {
      const filter: any = {
        agent_type: 'extraction',
        element_type: 'theorem'
      };

      if (documentId) {
        filter.document_id = documentId;
      }

      const knowledgeElements = await mongoConnection.searchKnowledgeElements(searchText, filter);
      return knowledgeElements.map(this.knowledgeElementToTheorem.bind(this));
    } catch (error) {
      Logger.error(`Error searching theorems with text "${searchText}":`, error);
      throw error;
    }
  }

  /**
   * Get relationships by document ID
   */
  async getRelationshipsByDocument(documentId: string, options?: {
    types?: RelationshipType[];
    minConfidence?: number;
    minStrength?: number;
    limit?: number;
  }): Promise<Relationship[]> {
    try {
      const filter: any = {
        document_id: documentId,
        agent_type: 'extraction',
        element_type: 'relationship'
      };

      if (options?.minConfidence) {
        filter.confidence_score = { $gte: options.minConfidence };
      }

      const knowledgeElements = await mongoConnection.findKnowledgeElements(filter, {
        limit: options?.limit,
        sort: { confidence_score: -1 }
      });

      const relationships = knowledgeElements.map(this.knowledgeElementToRelationship.bind(this));

      // Filter by strength if specified
      if (options?.minStrength !== undefined) {
        return relationships.filter(rel => rel.strength >= options.minStrength!);
      }

      return relationships;
    } catch (error) {
      Logger.error(`Error retrieving relationships for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Get knowledge graph for a document
   */
  async getKnowledgeGraph(documentId: string): Promise<KnowledgeGraph> {
    try {
      const knowledgeElements = await this.getExistingKnowledgeElements(documentId);
      const relationships = await this.getRelationshipsByDocument(documentId);
      
      return await this.buildKnowledgeGraph(documentId, knowledgeElements, relationships);
    } catch (error) {
      Logger.error(`Error retrieving knowledge graph for document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Search relationships by text
   */
  async searchRelationships(searchText: string, documentId?: string): Promise<Relationship[]> {
    try {
      const filter: any = {
        agent_type: 'extraction',
        element_type: 'relationship'
      };

      if (documentId) {
        filter.document_id = documentId;
      }

      const knowledgeElements = await mongoConnection.searchKnowledgeElements(searchText, filter);
      return knowledgeElements.map(this.knowledgeElementToRelationship.bind(this));
    } catch (error) {
      Logger.error(`Error searching relationships with text "${searchText}":`, error);
      throw error;
    }
  }

  /**
   * Search concepts by text
   */
  async searchConcepts(searchText: string, documentId?: string): Promise<Concept[]> {
    try {
      const filter: any = {
        agent_type: 'extraction',
        element_type: 'concept'
      };

      if (documentId) {
        filter.document_id = documentId;
      }

      const knowledgeElements = await mongoConnection.searchKnowledgeElements(searchText, filter);
      return knowledgeElements.map(this.knowledgeElementToConcept.bind(this));
    } catch (error) {
      Logger.error(`Error searching concepts with text "${searchText}":`, error);
      throw error;
    }
  }

  /**
   * Convert KnowledgeElement to Definition
   */
  private knowledgeElementToDefinition(element: KnowledgeElement): Definition {
    const metadata = element.content.metadata || {};
    
    return {
      id: element._id || '',
      term: element.content.title,
      definition: element.content.body,
      context: metadata.context || '',
      confidence: element.confidence_score || 0,
      importance: metadata.importance || 'LOW',
      sourceLocation: {
        section: element.source_location.section || '',
        paragraph: element.source_location.position?.paragraph,
        sentence: element.source_location.position?.sentence
      },
      definitionType: metadata.definitionType || 'EXPLICIT',
      relatedTerms: metadata.relatedTerms,
      examples: metadata.examples,
      metadata: {
        ...metadata,
        created_at: element.created_at,
        tags: element.tags
      }
    };
  }

  /**
   * Convert KnowledgeElement to Formula
   */
  private knowledgeElementToFormula(element: KnowledgeElement): Formula {
    const metadata = element.content.metadata || {};
    
    return {
      id: element._id || '',
      name: metadata.name,
      expression: metadata.expression || element.content.title,
      latex: metadata.latex,
      description: element.content.body.split('\n\nExpression:')[0],
      context: metadata.context || '',
      confidence: element.confidence_score || 0,
      importance: metadata.importance || 'LOW',
      sourceLocation: {
        section: element.source_location.section || '',
        paragraph: element.source_location.position?.paragraph,
        sentence: element.source_location.position?.sentence
      },
      formulaType: metadata.formulaType || 'GENERAL',
      variables: metadata.variables,
      domain: metadata.domain,
      applications: metadata.applications,
      relatedFormulas: metadata.relatedFormulas,
      metadata: {
        ...metadata,
        created_at: element.created_at,
        tags: element.tags
      }
    };
  }

  /**
   * Convert KnowledgeElement to Theorem
   */
  private knowledgeElementToTheorem(element: KnowledgeElement): Theorem {
    const metadata = element.content.metadata || {};
    
    return {
      id: element._id || '',
      name: element.content.title,
      statement: metadata.statement || element.content.body.split('\n\nProof:')[0],
      proof: metadata.proof,
      context: metadata.context || '',
      confidence: element.confidence_score || 0,
      importance: metadata.importance || 'LOW',
      sourceLocation: {
        section: element.source_location.section || '',
        paragraph: element.source_location.position?.paragraph,
        sentence: element.source_location.position?.sentence
      },
      theoremType: metadata.theoremType || 'GENERAL',
      domain: metadata.domain || 'General',
      prerequisites: metadata.prerequisites,
      applications: metadata.applications,
      relatedTheorems: metadata.relatedTheorems,
      corollaries: metadata.corollaries,
      examples: metadata.examples,
      metadata: {
        ...metadata,
        created_at: element.created_at,
        tags: element.tags
      }
    };
  }

  /**
   * Convert KnowledgeElement to Relationship
   */
  private knowledgeElementToRelationship(element: KnowledgeElement): Relationship {
    const metadata = element.content.metadata || {};
    
    return {
      id: element._id || '',
      sourceEntity: metadata.sourceEntity || '',
      targetEntity: metadata.targetEntity || '',
      relationshipType: metadata.relationshipType || 'GENERAL',
      description: element.content.body,
      context: metadata.context || '',
      confidence: element.confidence_score || 0,
      importance: metadata.importance || 'LOW',
      sourceLocation: {
        section: element.source_location.section || '',
        paragraph: element.source_location.position?.paragraph,
        sentence: element.source_location.position?.sentence
      },
      direction: metadata.direction || 'DIRECTED',
      strength: metadata.strength || 0.5,
      evidence: metadata.evidence || [],
      metadata: {
        ...metadata,
        created_at: element.created_at,
        tags: element.tags
      }
    };
  }

  /**
   * Convert KnowledgeElement to Concept
   */
  private knowledgeElementToConcept(element: KnowledgeElement): Concept {
    const metadata = element.content.metadata || {};
    
    return {
      id: element._id || '',
      name: element.content.title,
      description: element.content.body,
      category: metadata.category || 'GENERAL',
      confidence: element.confidence_score || 0,
      importance: metadata.importance || 'LOW',
      sourceLocation: {
        section: element.source_location.section || '',
        paragraph: element.source_location.position?.paragraph,
        sentence: element.source_location.position?.sentence
      },
      keyPoints: metadata.keyPoints || [],
      relatedConcepts: metadata.relatedConcepts,
      examples: metadata.examples,
      applications: metadata.applications,
      metadata: {
        ...metadata,
        created_at: element.created_at,
        tags: element.tags
      }
    };
  }

  /**
   * Convert KnowledgeElement to Entity
   */
  private knowledgeElementToEntity(element: KnowledgeElement): Entity {
    const metadata = element.content.metadata || {};
    
    return {
      id: element._id || '',
      text: element.content.title,
      type: metadata.entityType || 'MISC',
      startPosition: metadata.startPosition || 0,
      endPosition: metadata.endPosition || 0,
      confidence: element.confidence_score || 0,
      importance: metadata.importance || 'LOW',
      context: metadata.context || '',
      sourceLocation: {
        section: element.source_location.section || '',
        paragraph: element.source_location.position?.paragraph,
        sentence: element.source_location.position?.sentence
      },
      metadata: {
        ...metadata,
        created_at: element.created_at,
        tags: element.tags
      }
    };
  }
}