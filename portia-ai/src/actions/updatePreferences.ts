import {
    type Action,
    type ActionResult,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    MemoryType,
    ModelType,
    type State,
    logger,
  } from "@elizaos/core";
import OpenAI from 'openai';
import { UserPreferences } from "./types";

  /**
   * Make Twitter Post action
   * Posts content to Twitter via MCP server
   */
  export const updateUserPreferencesAction: Action = {
    name: "UPDATE_PREFERENCES",
    similes: ["UPDATE_SETTINGS", "UPDATE_PERSONAL_DATA"],
    description:
      "Change the preferences or settings for the borrowing preferences of the user.",
  
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

        const PROMPT = `You are trying to update a person's preference based on what they are saying here:

        ${query}

        You are to return the results in the form of a json file containing the following fields:

        userId (string): The user ID.
        walletAddress (string): The wallet address of the user.
        targetSupplyApyDeviation (float): Target supply APY for activating the research agent. If the data goes above or below this threshold (in difference), activate the research agent.
        date (datetime): The date and time for updating the target supply APY.
        vaultAddresses (List[string]): The list of vault addresses for a particular protocol.
        portfolioPercentages (Dict: string: {string: float}): A dictionary containing the available protocols and their vault address as keys, as well as a float for the percentage.
        riskToleranceRating: Set as a float between 1 and 10, where 1 is zero risk and 10 is high risk. This is for describing the portfolio rebalancing risk for AI in the Opportunity Calculation Agent.

        If these are not explicitly stated in the query, do not try to deduce them (except the date). 
        
        Output this as a json:

        \`\`\`
            userId: string,
            walletAddress string,
            userId (string): The user ID.
            walletAddress: string 
            targetSupplyApyDeviation: float
            date (datetime): The date and time for updating the target supply APY.
            vaultAddresses: List[string]
            portfolioPercentages: (Dict: string: {string: float})
            riskToleranceRating: float
        \`\`\`

        `

          try {
            const response = await runtime.useModel(ModelType.OBJECT_SMALL, {
                prompt: PROMPT
              }) as UserPreferences;

              const memory = {
                id: '1-1-1-1-1',
                content: response as unknown as Record<string, unknown>,
                entityId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
            } as Memory

            if (await runtime.getMemoriesByIds(['1-1-1-1-1'])) { 
                const memoryId = '1-1-1-1-1'
                await runtime.deleteMemory(memoryId);
                await runtime.createMemory(memory, 'userPreferences', true);
            } else {
              await runtime.createMemory(
                memory,
                "userPreferences",
                false
              )
            }
            
            logger.info("updatePreferences action is successful")

            return {
                success: true,
                text: "Your preferences have been updated. Thank you!"
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