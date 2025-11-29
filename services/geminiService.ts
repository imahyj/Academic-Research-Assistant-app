
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { PdfDocument } from '../types';

const baseConfig = {
  temperature: 0.2, // Low temperature for factual precision
  topP: 0.95,
  topK: 64,
};

const safetySettings = [
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
];

const createPrompt = (documents: PdfDocument[], query: string) => {
  let context = '';
  documents.forEach((doc, index) => {
    // Use 1-based indexing for documents in the prompt for clarity
    context += `--- DOCUMENT ${index + 1} (${doc.file.name}) START ---\n`;
    context += `${doc.text}\n`;
    context += `--- DOCUMENT ${index + 1} END ---\n\n`;
  });

  return `
You are an advanced, world-class academic research assistant powered by Gemini 2.5. Your persona is that of a senior tenured professor: rigorous, critical, and precise.

GOAL: Synthesize information from the provided PDF documents to answer the user's question with PhD-level depth.

CRITICAL INSTRUCTIONS:
1.  **Strict Citations**: Every claim must be supported by a citation in the format [DocIndex:PageNumber | "short direct quote"]. E.g., [1:12 | "methodology was flawed"]. The quote is CRITICAL for highlighting the source in the document viewer.
2.  **Methodological Critique**: When discussing findings, briefly evaluate the methodology (sample size, duration, controls).
3.  **Synthesis & Conflict Resolution**: Do not just list facts. Synthesize them. If Document A contradicts Document B, explicitly state the contradiction and analyze *why* (e.g., "Document 1 finds X, whereas Document 2 argues Y, likely due to a difference in population demographics [2:14 | "sample consisted of..."]").
4.  **Gap Analysis**: Where appropriate, identify what the papers *do not* cover.
5.  **Format**: Use clean Markdown. Use tables for direct data comparisons. Use bolding for key terms.

Here are the source documents:

${context}

--- RESEARCH QUERY ---
${query}
--- END OF QUERY ---
  `;
};

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please select a Google Cloud Project to continue.");
  }
  return new GoogleGenAI({ apiKey });
};

export const queryPdfContentStream = async function* (
  documents: PdfDocument[], 
  query: string, 
  useDeepReasoning: boolean
): AsyncGenerator<string, void, unknown> {
  
  if (documents.length === 0) {
    yield "Please select at least one document to query.";
    return;
  }
  
  const prompt = createPrompt(documents, query);

  // Configure Thinking Budget if Deep Reasoning is enabled
  const config: any = { ...baseConfig };
  
  if (useDeepReasoning) {
    // Allocate higher tokens for complex academic reasoning (8k)
    // The model is gemini-2.5-flash, which supports thinking.
    config.thinkingConfig = { thinkingBudget: 8192 }; 
  } else {
    // Disable thinking for standard queries to prioritize speed
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  try {
    const ai = getAiClient();
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
      config: config,
      // @ts-ignore - safetySettings type definition might vary by SDK version
      safetySettings: safetySettings,
    });

    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        yield c.text;
      }
    }
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    if (error.message?.includes('403') || error.status === 'PERMISSION_DENIED') {
        yield "\n\n**Access Denied:** The API key does not have permission to access the model. Please check your billing status or select a different project.";
    } else {
        yield `\n\n**Error:** ${error.message || 'Failed to communicate with the AI model.'}`;
    }
  }
};

export const summarizePdfContentStream = async function* (documents: PdfDocument[]): AsyncGenerator<string, void, unknown> {
    let query: string;
    if (documents.length > 1) {
        query = "Provide a structured executive summary for the provided documents. First, summarize each document individually (with a header). Then, provide a 'Synthesis' section that compares their methodologies, results, and conclusions. Finally, provide a 'Research Gap' section.";
    } else {
        query = "Provide a detailed academic summary of this document. Structure it with the following sections: 'Abstract', 'Key Methodologies', 'Main Findings', 'Critical Analysis', and 'Conclusions'.";
    }
    
    // Use standard reasoning for summaries to be faster, unless we want deep summaries later
    const stream = queryPdfContentStream(documents, query, false);
    
    for await (const chunk of stream) {
      yield chunk;
    }
}
