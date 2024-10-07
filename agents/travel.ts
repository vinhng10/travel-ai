import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import cheerio from "react-native-cheerio";
import { z } from "zod";
import fs from "fs";
import { RunnableConfig, RunnableSequence } from "@langchain/core/runnables";
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools";
import { ChatOpenAI } from "@langchain/openai";

// Define a database of execution results:
const database: Record<string, string> = {};

const store = (key: string, data: string): void => {
  database[key] = data;
};

// Define tools:
const search = tool(
  async ({ query }) => {
    try {
      const params = new URLSearchParams();
      params.append("key", "");
      params.set("cx", "");
      params.set("q", query);
      params.set("start", "1");

      // Make the HTTP GET request to the Google Custom Search JSON API
      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?${params}`
      );

      const data = await response.json();

      const searchResults = data.items || [];

      // Extract search results and parse them
      const results = searchResults
        .slice(0, 3)
        .map(
          (searchItem) =>
            `Title: ${searchItem.title}\nDescription: ${searchItem.snippet}\nURL: ${searchItem.link}`
        )
        .join("\n\n");

      return results;
    } catch (e) {
      console.error(`Error making Google search: ${e}`);
      return "Search failed.";
    }
  },
  {
    name: "web-search",
    description:
      "Perform a web search given a query string. The search result will be a list of (Title, Description, URL) tuples.",
    schema: z.object({
      query: z.string().describe("The search query to be used."),
    }),
  }
);

const scrape = tool(
  async ({ url }) => {
    try {
      // Send an HTTP GET request to the URL
      const response = await fetch(url);

      // Check if the request was successful (status code 200)
      if (response.status !== 200) {
        throw Error("Fetch URL failed");
      }

      // Parse the HTML content of the page using cheerio
      const data = await response.text();
      const $ = cheerio.load(data);

      // Extract the text content of the webpage and limit it to 2000 characters
      const text = $("p")
        .map((i, p) => $(p).text().trim())
        .get()
        .join("\n")
        .slice(0, 2000);

      return text;
    } catch (e) {
      console.error(`An error occurred: ${e}`);
      return "";
    }
  },
  {
    name: "extract-webpage-text-content",
    description:
      "Extract and return the text content from the webpage at the given URL.",
    schema: z.object({
      url: z
        .string()
        .describe("The URL of the webpage to scrape for text content."),
    }),
  }
);

const plan = tool(
  ({ steps }) => {
    return steps.join("\n");
  },
  {
    name: "plan",
    description:
      "Create a detailed step by step plan to complete an objective.",
    schema: z.object({
      steps: z
        .array(z.string())
        .describe("The list of steps to follow, should be in sorted order."),
    }),
  }
);

const query = tool(
  ({ key }) => {
    if (key in database) return database[key];
    if (`${key}.` in database) return database[`${key}.`];
    const match = Object.keys(database).find((k) => k.includes(key));
    return match
      ? database[match]
      : "Query failed. Try querying with the correct step name.";
  },
  {
    name: "query-database",
    description: "Query database for previous step execution result.",
    schema: z.object({
      key: z.string().describe("Query key, which is the name of the step."),
    }),
  }
);

const response = tool(
  (answer) => {
    console.log(answer);
  },
  {
    name: "response",
    description: "Response the final solution or conclusion to the user.",
    schema: z.object({
      response: z.string().describe("The final response to the user."),
    }),
  }
);

// Instantiate an LLM model:
const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
});

// Define the State:
const PlanExecuteState = Annotation.Root({
  objective: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
  }),
  plan: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
  }),
  pastSteps: Annotation<[string, string][]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  response: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
});

// Define the Execution Agent:
const executeAgent = RunnableSequence.from([
  ChatPromptTemplate.fromTemplate(
    fs.readFileSync("./prompts/react.txt", "utf-8")
  ),
  createReactAgent({
    llm: llm,
    tools: [plan, search, scrape, query],
  }),
]);

async function executeStep(
  state: typeof PlanExecuteState.State,
  config?: RunnableConfig
): Promise<Partial<typeof PlanExecuteState.State>> {
  const step = state.plan[0];
  const input = {
    objective: step,
    pastSteps: state.pastSteps
      .map(([step, _], index) => `${index + 1}. Name: ${step}`)
      .join("\n"),
  };
  const { messages } = await executeAgent.invoke(input, config);
  const result = messages.at(-1).content;

  // Store results in database:
  store(step, result);

  return {
    pastSteps: [[step, result]],
    plan: state.plan.slice(1),
  };
}

// Define the Planning Agent:
const planAgent = RunnableSequence.from([
  ChatPromptTemplate.fromTemplate(
    fs.readFileSync("./prompts/plan.txt", "utf-8")
  ),
  llm.withStructuredOutput(plan.schema),
]);

async function planStep(
  state: typeof PlanExecuteState.State
): Promise<Partial<typeof PlanExecuteState.State>> {
  const { steps } = await planAgent.invoke({
    objective: state.objective,
  });
  return { plan: steps };
}

// Define the Replanning Agent:
const parser = new JsonOutputToolsParser();
const replanAgent = RunnableSequence.from([
  ChatPromptTemplate.fromTemplate(
    fs.readFileSync("./prompts/replan.txt", "utf-8")
  ),
  llm.bindTools([plan, response]),
  parser,
]);

async function replanStep(
  state: typeof PlanExecuteState.State
): Promise<Partial<typeof PlanExecuteState.State>> {
  const output = await replanAgent.invoke({
    objective: state.objective,
    plan: state.plan.join("\n"),
    pastSteps: state.pastSteps
      .map(
        ([step, result], index) =>
          `${index + 1}. Name: ${step}\nResult: ${result}`
      )
      .join("\n"),
  });
  const toolCall = output[0];

  if (toolCall.type == "response") {
    return { response: toolCall.args?.response };
  }

  return { plan: toolCall.args?.steps };
}

function shouldEnd(state: typeof PlanExecuteState.State) {
  return state.response ? "true" : "false";
}

const workflow = new StateGraph(PlanExecuteState)
  .addNode("planner", planStep)
  .addNode("agent", executeStep)
  .addNode("replan", replanStep)
  .addEdge(START, "planner")
  .addEdge("planner", "agent")
  .addEdge("agent", "replan")
  .addConditionalEdges("replan", shouldEnd, {
    true: END,
    false: "agent",
  });

const graph = workflow.compile();

const input = {
  objective:
    "Are Jessen Huang and Ian Goodfellow known for the same type of work?",
};

const config = {
  recursionLimit: 50,
  configurable: {
    thread_id: "42",
  },
};

const stream = await graph.stream(input, config);

for await (const event of stream) {
  console.log(event);
  console.log(`%c=============================`, "color: yellow");
}
