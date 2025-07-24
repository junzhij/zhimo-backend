import { PedagogyAgent } from './index';
import {
    StructuredText,
    KnowledgeElement,
    QuestionGenerationOptions,
    FlashcardOptions,
    OpenEndedQuestionOptions
} from '../../types';

// Example usage of the Pedagogy Agent
async function demonstratePedagogyAgent() {
    const pedagogyAgent = new PedagogyAgent();

    // Sample structured text
    const structuredText: StructuredText = {
        title: 'Introduction to Machine Learning',
        sections: [
            {
                heading: 'What is Machine Learning?',
                content: 'Machine learning is a subset of artificial intelligence (AI) that enables computers to learn and make decisions from data without being explicitly programmed for every task.',
                subsections: [
                    {
                        heading: 'Types of Machine Learning',
                        content: 'There are three main types: supervised learning (learning from labeled data), unsupervised learning (finding patterns in unlabeled data), and reinforcement learning (learning through trial and error).'
                    }
                ]
            },
            {
                heading: 'Applications of Machine Learning',
                content: 'Machine learning is used in various applications including image recognition, natural language processing, recommendation systems, autonomous vehicles, and medical diagnosis.'
            }
        ],
        metadata: {
            wordCount: 200,
            pageCount: 2,
            language: 'en'
        }
    };

    // Sample knowledge elements
    const knowledgeElements: KnowledgeElement[] = [
        {
            document_id: 'doc-1',
            agent_type: 'extraction',
            element_type: 'definition',
            content: {
                title: 'Machine Learning',
                body: 'A subset of artificial intelligence that enables computers to learn from data without being explicitly programmed'
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
                body: 'A type of machine learning where algorithms learn from labeled training data to make predictions on new, unseen data'
            },
            source_location: {
                section: 'Types of Machine Learning',
                page: 1
            },
            created_at: new Date(),
            tags: ['supervised', 'learning', 'concept']
        },
        {
            document_id: 'doc-1',
            agent_type: 'analysis',
            element_type: 'theme',
            content: {
                title: 'AI Applications',
                body: 'The widespread application of artificial intelligence and machine learning across various industries and domains'
            },
            source_location: {
                section: 'Applications of Machine Learning',
                page: 2
            },
            created_at: new Date(),
            tags: ['applications', 'AI', 'industry']
        }
    ];

    try {
        console.log('=== Pedagogy Agent Demonstration ===\n');

        // 1. Generate various types of questions
        console.log('1. Generating Questions...');
        const questionOptions: QuestionGenerationOptions = {
            questionTypes: ['multiple_choice', 'fill_in_blank', 'short_answer', 'essay'],
            difficulty: 'medium',
            numQuestions: 8,
            focusAreas: ['machine learning basics', 'AI applications']
        };

        const questionResult = await pedagogyAgent.generateQuestions(
            structuredText,
            knowledgeElements,
            questionOptions
        );

        console.log(`Generated ${questionResult.totalGenerated} questions:`);
        console.log(`- Multiple Choice: ${questionResult.multipleChoice.length}`);
        console.log(`- Fill-in-Blank: ${questionResult.fillInBlank.length}`);
        console.log(`- Short Answer: ${questionResult.shortAnswer.length}`);
        console.log(`- Essay: ${questionResult.essay.length}`);
        console.log(`Confidence: ${(questionResult.confidence * 100).toFixed(1)}%\n`);

        // Example multiple choice question
        if (questionResult.multipleChoice.length > 0) {
            const mcq = questionResult.multipleChoice[0];
            console.log('Sample Multiple Choice Question:');
            console.log(`Q: ${mcq.question}`);
            mcq.options.forEach((option, index) => {
                const letter = String.fromCharCode(65 + index); // A, B, C, D
                const marker = index === mcq.correctAnswer ? '✓' : ' ';
                console.log(`${marker} ${letter}) ${option}`);
            });
            console.log(`Explanation: ${mcq.explanation}\n`);
        }

        // 2. Generate flashcards
        console.log('2. Generating Flashcards...');
        const flashcardOptions: FlashcardOptions = {
            includeDefinitions: true,
            includeFormulas: false,
            includeConcepts: true,
            difficulty: 'medium',
            spacedRepetition: true
        };

        const flashcardResult = await pedagogyAgent.generateFlashcards(
            knowledgeElements,
            flashcardOptions
        );

        console.log(`Generated ${flashcardResult.totalGenerated} flashcards:`);
        console.log(`Confidence: ${(flashcardResult.confidence * 100).toFixed(1)}%\n`);

        // Example flashcard
        if (flashcardResult.flashcards.length > 0) {
            const flashcard = flashcardResult.flashcards[0];
            console.log('Sample Flashcard:');
            console.log(`Front: ${flashcard.front}`);
            console.log(`Back: ${flashcard.back}`);
            console.log(`Type: ${flashcard.cardType}`);
            console.log(`Difficulty: ${flashcard.difficulty}`);
            if (flashcard.spacedRepetitionData) {
                console.log(`Next Review: ${flashcard.spacedRepetitionData.nextReviewDate.toDateString()}`);
            }
            console.log();
        }

        // 3. Generate open-ended questions
        console.log('3. Generating Open-Ended Questions...');
        const openEndedOptions: OpenEndedQuestionOptions = {
            questionTypes: ['discussion', 'critical_thinking', 'socratic'],
            complexity: 'intermediate',
            numQuestions: 6,
            focusThemes: ['AI ethics', 'technology impact']
        };

        const openEndedResult = await pedagogyAgent.generateOpenEndedQuestions(
            structuredText,
            knowledgeElements,
            openEndedOptions
        );

        console.log(`Generated ${openEndedResult.totalGenerated} open-ended questions:`);
        console.log(`Confidence: ${(openEndedResult.confidence * 100).toFixed(1)}%\n`);

        // Example open-ended question
        if (openEndedResult.questions.length > 0) {
            const openQuestion = openEndedResult.questions[0];
            console.log('Sample Open-Ended Question:');
            console.log(`Type: ${openQuestion.questionType}`);
            console.log(`Complexity: ${openQuestion.complexity}`);
            console.log(`Q: ${openQuestion.question}`);
            console.log('Guiding Points:');
            openQuestion.guidingPoints.forEach(point => console.log(`  • ${point}`));
            console.log('Related Concepts:');
            openQuestion.relatedConcepts.forEach(concept => console.log(`  • ${concept}`));
            console.log();
        }

        console.log('=== Pedagogy Agent Demonstration Complete ===');

    } catch (error) {
        console.error('Error in pedagogy agent demonstration:', error);
    }
}

// Export for use in other modules
export { demonstratePedagogyAgent };

// Run demonstration if this file is executed directly
if (require.main === module) {
    demonstratePedagogyAgent().catch(console.error);
}