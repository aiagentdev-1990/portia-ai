import {
    type Action,
    type ActionResult,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelType,
    type State,
    logger,
  } from "@elizaos/core";
import OpenAI from 'openai';

  /**
   * Make Twitter Post action
   * Posts content to Twitter via MCP server
   */
  export const makePerplexitySearchAction: Action = {
    name: "SEARCH_INFO",
    similes: ["PERPLEXITY_SEARCH", "ONLINE_SEARCH", "INTERNET_SEARCH"],
    description:
      "Conduct a search online for crypto news on the status of the vault. Research online thoroghly using Perplexity.",
  
    validate: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<boolean> => {
      // Always valid
      return true;
    },
  
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      options: any,
      callback: HandlerCallback,
      responses: Memory[],
    ): Promise<ActionResult> => {

        logger.info("perplexitySearch Action is called.")

        const query = message.content.text

        const PROMPT = `You are helping a crypto user who has some stake in a vault such as Aave, Morpho, Euler etc. They are trying to find out why this is happening:

        ${query}

        Summarize your findings in 5 sentences, in paragraph form.
        `

        const perplexity = new OpenAI({
            apiKey: process.env.PERPLEXITY_API_KEY || '',
            baseURL: 'https://api.perplexity.ai'
          });

          try {
            const response = await perplexity.chat.completions.create({
              model: 'llama-3.1-sonar-small-128k-online',
              messages: [
                { role: 'system', content: 'Be precise and concise.' },
                { role: 'user', content: PROMPT }
              ]
            });

            logger.info("perplexitySearch action is successful")

            return {
                success: true,
                text: response.choices[0].message.content
            } 
        
          } catch (error) {
            console.error('Error with Perplexity:', error);

            return {
                success: false,
                text: error
            }
          }
        },

    examples: []
}  