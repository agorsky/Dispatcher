/**
 * Integration tests for MCP Task tools
 *
 * Tests the task tool handlers:
 * - spectree__list_tasks
 * - spectree__get_task
 * - spectree__create_task
 * - spectree__update_task
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

// Type for tool handler
interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Use vi.hoisted to declare variables available to hoisted mocks
const { mockApiClient } = vi.hoisted(() => {
  const mockApiClient = {
    listTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    getFeature: vi.fn(),
    getEpic: vi.fn(),
    listStatuses: vi.fn(),
    resolveStatusId: vi.fn(),
    setTaskStructuredDesc: vi.fn(),
  };
  return { mockApiClient };
});

// Mock the API client before importing the tools
vi.mock("../src/api-client.js", () => ({
  getApiClient: () => mockApiClient,
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
  },
}));

// Store registered tools
const registeredTools = new Map<
  string,
  {
    config: { description: string; inputSchema: Record<string, unknown> };
    handler: (input: Record<string, unknown>) => Promise<ToolResponse>;
  }
>();

// Import after mocking
import { registerTaskTools } from "../src/tools/tasks.js";

// Create mock server and register tools
const mockServer = {
  registerTool: (
    name: string,
    config: { description: string; inputSchema: Record<string, unknown> },
    handler: (input: Record<string, unknown>) => Promise<ToolResponse>
  ) => {
    registeredTools.set(name, { config, handler });
  },
};

// Register tools before tests
beforeAll(() => {
  registerTaskTools(mockServer as any);
});

describe("MCP Tasks Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("spectree__list_tasks", () => {
    const getHandler = () => registeredTools.get("spectree__list_tasks")?.handler;

    it("should list tasks without filters", async () => {
      const mockTasks = [
        {
          id: "task-1",
          identifier: "ENG-1-1",
          title: "Design API schema",
          description: "Create OpenAPI spec",
          featureId: "feat-1",
          statusId: "status-1",
          assigneeId: "user-1",
          sortOrder: 1,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
        },
        {
          id: "task-2",
          identifier: "ENG-1-2",
          title: "Implement endpoints",
          description: null,
          featureId: "feat-1",
          statusId: null,
          assigneeId: null,
          sortOrder: 2,
          createdAt: "2024-01-03T00:00:00.000Z",
          updatedAt: "2024-01-04T00:00:00.000Z",
        },
      ];

      mockApiClient.listTasks.mockResolvedValue({
        data: mockTasks,
        meta: { cursor: null, hasMore: false },
      });

      const handler = getHandler();
      expect(handler).toBeDefined();

      const result = await handler!({});

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.tasks).toHaveLength(2);
      expect(data.tasks[0].identifier).toBe("ENG-1-1");
      expect(data.tasks[1].identifier).toBe("ENG-1-2");
    });

    it("should filter by feature", async () => {
      mockApiClient.listTasks.mockResolvedValue({
        data: [],
        meta: { cursor: null, hasMore: false },
      });

      const handler = getHandler();
      const result = await handler!({ feature: "COM-123" });

      expect(mockApiClient.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ feature: "COM-123" })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should filter by status", async () => {
      mockApiClient.listTasks.mockResolvedValue({
        data: [],
        meta: { cursor: null, hasMore: false },
      });

      const handler = getHandler();
      const result = await handler!({ status: "status-uuid-123" });

      expect(mockApiClient.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ status: "status-uuid-123" })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should filter by assignee", async () => {
      mockApiClient.listTasks.mockResolvedValue({
        data: [],
        meta: { cursor: null, hasMore: false },
      });

      const handler = getHandler();
      const result = await handler!({ assignee: "user-uuid-456" });

      expect(mockApiClient.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ assignee: "user-uuid-456" })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should handle pagination", async () => {
      mockApiClient.listTasks.mockResolvedValue({
        data: [],
        meta: { cursor: "next-cursor-token", hasMore: true },
      });

      const handler = getHandler();
      const result = await handler!({ limit: 10, cursor: "prev-cursor" });

      expect(mockApiClient.listTasks).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, cursor: "prev-cursor" })
      );

      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.meta.hasMore).toBe(true);
      expect(data.meta.cursor).toBe("next-cursor-token");
    });

    it("should handle API errors", async () => {
      const ApiError = (await import("../src/api-client.js")).ApiError;
      mockApiClient.listTasks.mockRejectedValue(new ApiError("Not found", 404));

      const handler = getHandler();
      const result = await handler!({ feature: "NON-EXISTENT" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("not found");
    });
  });

  describe("spectree__get_task", () => {
    const getHandler = () => registeredTools.get("spectree__get_task")?.handler;

    it("should get task by UUID", async () => {
      const mockTask = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        identifier: "ENG-42-1",
        title: "Implement validation",
        description: "Add input validation",
        featureId: "feat-1",
        statusId: "status-1",
        assigneeId: "user-1",
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };

      mockApiClient.getTask.mockResolvedValue({ data: mockTask });

      const handler = getHandler();
      expect(handler).toBeDefined();

      const result = await handler!({ id: "550e8400-e29b-41d4-a716-446655440000" });

      expect(mockApiClient.getTask).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(data.title).toBe("Implement validation");
    });

    it("should get task by identifier", async () => {
      const mockTask = {
        id: "task-uuid",
        identifier: "COM-42-3",
        title: "Test task",
        description: null,
        featureId: "feat-1",
        statusId: null,
        assigneeId: null,
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };

      mockApiClient.getTask.mockResolvedValue({ data: mockTask });

      const handler = getHandler();
      const result = await handler!({ id: "COM-42-3" });

      expect(mockApiClient.getTask).toHaveBeenCalledWith("COM-42-3");
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.identifier).toBe("COM-42-3");
    });

    it("should return error for non-existent task", async () => {
      const ApiError = (await import("../src/api-client.js")).ApiError;
      mockApiClient.getTask.mockRejectedValue(new ApiError("Task not found", 404));

      const handler = getHandler();
      const result = await handler!({ id: "non-existent" });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("not found");
    });
  });

  describe("spectree__create_task", () => {
    const getHandler = () => registeredTools.get("spectree__create_task")?.handler;

    it("should create task with required fields only", async () => {
      const mockFeature = {
        id: "feat-1",
        identifier: "ENG-1",
        title: "Feature",
        epicId: "epic-1",
      };
      
      const mockTask = {
        id: "new-task-id",
        identifier: "ENG-1-1",
        title: "New Task",
        description: null,
        featureId: "feat-1",
        statusId: null,
        assigneeId: null,
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      mockApiClient.getFeature.mockResolvedValue({ data: mockFeature });
      mockApiClient.createTask.mockResolvedValue({ data: mockTask, warnings: [] });

      const handler = getHandler();
      expect(handler).toBeDefined();

      const result = await handler!({
        title: "New Task",
        feature_id: "feat-1",
        executionOrder: 1,
        estimatedComplexity: "simple",
      });

      expect(mockApiClient.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New Task",
          featureId: "feat-1",
        })
      );
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.title).toBe("New Task");
    });

    it("should create task with all fields", async () => {
      const mockFeature = {
        id: "feat-1",
        identifier: "ENG-1",
        title: "Feature",
        epicId: "epic-1",
      };
      
      const mockEpic = {
        id: "epic-1",
        name: "Test Epic",
        teamId: "team-1",
      };
      
      const mockTask = {
        id: "new-task-id",
        identifier: "ENG-1-1",
        title: "Full Task",
        description: "Task description",
        featureId: "feat-1",
        statusId: "status-1",
        assigneeId: "user-1",
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      mockApiClient.getFeature.mockResolvedValue({ data: mockFeature });
      mockApiClient.getEpic.mockResolvedValue({ data: mockEpic });
      mockApiClient.resolveStatusId.mockResolvedValue("status-1");
      mockApiClient.createTask.mockResolvedValue({ data: mockTask, warnings: [] });

      const handler = getHandler();
      const result = await handler!({
        title: "Full Task",
        feature_id: "feat-1",
        description: "Task description",
        status: "status-1",
        assignee: "user-1",
        executionOrder: 1,
        estimatedComplexity: "moderate",
      });

      expect(mockApiClient.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Full Task",
          featureId: "feat-1",
          description: "Task description",
          statusId: "status-1",
          assigneeId: "user-1",
        })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should handle API errors on create", async () => {
      const ApiError = (await import("../src/api-client.js")).ApiError;
      mockApiClient.getFeature.mockRejectedValue(new ApiError("Feature not found", 404));

      const handler = getHandler();
      const result = await handler!({
        title: "New Task",
        feature_id: "non-existent",
        executionOrder: 1,
        estimatedComplexity: "simple",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("not found");
    });
  });

  describe("spectree__update_task", () => {
    const getHandler = () => registeredTools.get("spectree__update_task")?.handler;

    it("should update task by UUID", async () => {
      const mockTask = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        identifier: "ENG-1-1",
        title: "Updated Title",
        description: "Updated description",
        featureId: "feat-1",
        statusId: "new-status",
        assigneeId: "new-user",
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };

      mockApiClient.updateTask.mockResolvedValue({ data: mockTask });

      const handler = getHandler();
      expect(handler).toBeDefined();

      const result = await handler!({
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Updated Title",
        description: "Updated description",
      });

      expect(mockApiClient.updateTask).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        expect.objectContaining({
          title: "Updated Title",
          description: "Updated description",
        })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should update task by identifier", async () => {
      const mockTask = {
        id: "task-uuid",
        identifier: "COM-42-3",
        title: "Changed",
        description: null,
        featureId: "feat-1",
        statusId: null,
        assigneeId: null,
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };

      mockApiClient.updateTask.mockResolvedValue({ data: mockTask });

      const handler = getHandler();
      const result = await handler!({
        id: "COM-42-3",
        title: "Changed",
      });

      expect(mockApiClient.updateTask).toHaveBeenCalledWith("COM-42-3", expect.any(Object));
      expect(result.isError).toBeUndefined();
    });

    it("should update task status", async () => {
      const mockTask = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        identifier: "ENG-1-1",
        title: "Task",
        description: null,
        featureId: "feat-1",
        statusId: "new-status-uuid",
        assigneeId: null,
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };

      const mockFeature = {
        id: "feat-1",
        identifier: "ENG-1",
        title: "Feature",
        epicId: "epic-1",
      };

      const mockEpic = {
        id: "epic-1",
        name: "Test Epic",
        teamId: "team-1",
      };

      mockApiClient.getTask.mockResolvedValue({ data: mockTask });
      mockApiClient.getFeature.mockResolvedValue({ data: mockFeature });
      mockApiClient.getEpic.mockResolvedValue({ data: mockEpic });
      mockApiClient.resolveStatusId.mockResolvedValue("new-status-uuid");
      mockApiClient.updateTask.mockResolvedValue({ data: mockTask });

      const handler = getHandler();
      const result = await handler!({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "new-status-uuid",
      });

      expect(mockApiClient.updateTask).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        expect.objectContaining({
          statusId: "new-status-uuid",
        })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should update task assignee", async () => {
      const mockTask = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        identifier: "ENG-1-1",
        title: "Task",
        description: null,
        featureId: "feat-1",
        statusId: null,
        assigneeId: "new-assignee-uuid",
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };

      mockApiClient.updateTask.mockResolvedValue({ data: mockTask });

      const handler = getHandler();
      const result = await handler!({
        id: "550e8400-e29b-41d4-a716-446655440000",
        assignee: "new-assignee-uuid",
      });

      expect(mockApiClient.updateTask).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        expect.objectContaining({
          assigneeId: "new-assignee-uuid",
        })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should resolve status name to UUID when updating", async () => {
      const mockTask = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        identifier: "ENG-1-1",
        title: "Task",
        description: null,
        featureId: "feat-1",
        statusId: "resolved-status-uuid",
        assigneeId: null,
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };

      const mockFeature = {
        id: "feat-1",
        identifier: "ENG-1",
        title: "Feature",
        epicId: "epic-1",
      };

      const mockEpic = {
        id: "epic-1",
        name: "Test Epic",
        teamId: "team-1",
      };

      mockApiClient.getTask.mockResolvedValue({ data: mockTask });
      mockApiClient.getFeature.mockResolvedValue({ data: mockFeature });
      mockApiClient.getEpic.mockResolvedValue({ data: mockEpic });
      mockApiClient.resolveStatusId.mockResolvedValue("resolved-status-uuid");
      mockApiClient.updateTask.mockResolvedValue({ data: mockTask });

      const handler = getHandler();
      const result = await handler!({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "Done",  // Pass status name instead of UUID
      });

      // Verify resolveStatusId was called with the status name
      expect(mockApiClient.resolveStatusId).toHaveBeenCalledWith("Done", "team-1");
      
      // Verify updateTask was called with the resolved UUID
      expect(mockApiClient.updateTask).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        expect.objectContaining({
          statusId: "resolved-status-uuid",
        })
      );
      expect(result.isError).toBeUndefined();
    });

    it("should return error for non-existent task", async () => {
      const ApiError = (await import("../src/api-client.js")).ApiError;
      mockApiClient.updateTask.mockRejectedValue(new ApiError("Task not found", 404));

      const handler = getHandler();
      const result = await handler!({
        id: "non-existent",
        title: "New Title",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("not found");
    });
  });

  describe("spectree__create_task with structuredDesc", () => {
    const getHandler = () => registeredTools.get("spectree__create_task")?.handler;

    const mockFeature = {
      id: "feat-1",
      identifier: "ENG-1",
      title: "Feature",
      epicId: "epic-1",
    };

    const mockTask = {
      id: "new-task-id",
      identifier: "ENG-1-1",
      title: "Task with structuredDesc",
      description: null,
      featureId: "feat-1",
      statusId: null,
      assigneeId: null,
      sortOrder: 1,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    it("should persist structuredDesc when provided", async () => {
      mockApiClient.getFeature.mockResolvedValue({ data: mockFeature });
      mockApiClient.createTask.mockResolvedValue({ data: mockTask, warnings: [] });
      mockApiClient.setTaskStructuredDesc.mockResolvedValue({ data: {} });

      const handler = getHandler();
      const result = await handler!({
        title: "Task with structuredDesc",
        feature_id: "feat-1",
        executionOrder: 1,
        estimatedComplexity: "moderate",
        structuredDesc: {
          summary: "Test summary",
          aiInstructions: "Step 1: do X",
          acceptanceCriteria: ["AC 1", "AC 2"],
        },
      });

      expect(mockApiClient.setTaskStructuredDesc).toHaveBeenCalledWith(
        "new-task-id",
        expect.objectContaining({
          summary: "Test summary",
          aiInstructions: "Step 1: do X",
          acceptanceCriteria: ["AC 1", "AC 2"],
        })
      );
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.message).toContain("with structuredDesc");
    });

    it("should return warnings when structuredDesc is not provided", async () => {
      mockApiClient.getFeature.mockResolvedValue({ data: mockFeature });
      mockApiClient.createTask.mockResolvedValue({
        data: mockTask,
        warnings: ["Task is missing structuredDesc. Pre-flight checks will fail."],
      });

      const handler = getHandler();
      const result = await handler!({
        title: "Task without structuredDesc",
        feature_id: "feat-1",
        executionOrder: 1,
        estimatedComplexity: "simple",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.warnings).toBeDefined();
      expect(data.warnings.length).toBeGreaterThan(0);
      expect(data.warnings[0]).toContain("structuredDesc");
    });

    it("should still create task when structuredDesc save fails", async () => {
      mockApiClient.getFeature.mockResolvedValue({ data: mockFeature });
      mockApiClient.createTask.mockResolvedValue({ data: mockTask, warnings: [] });
      mockApiClient.setTaskStructuredDesc.mockRejectedValue(new Error("DB error"));

      const handler = getHandler();
      const result = await handler!({
        title: "Task with failing structuredDesc",
        feature_id: "feat-1",
        executionOrder: 1,
        estimatedComplexity: "moderate",
        structuredDesc: {
          summary: "Test summary",
          aiInstructions: "Step 1",
        },
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.message).toContain("structuredDesc failed to save");
      expect(data.warnings).toBeDefined();
    });
  });

  describe("tool registration", () => {
    it("should register all task tools", () => {
      expect(registeredTools.has("spectree__list_tasks")).toBe(true);
      expect(registeredTools.has("spectree__get_task")).toBe(true);
      expect(registeredTools.has("spectree__create_task")).toBe(true);
      expect(registeredTools.has("spectree__update_task")).toBe(true);
    });

    it("should have proper descriptions", () => {
      const listTool = registeredTools.get("spectree__list_tasks");
      const getTool = registeredTools.get("spectree__get_task");
      const createTool = registeredTools.get("spectree__create_task");
      const updateTool = registeredTools.get("spectree__update_task");

      expect(listTool?.config.description).toContain("List tasks");
      expect(getTool?.config.description).toContain("Get detailed information");
      expect(createTool?.config.description).toContain("Create a new task");
      expect(updateTool?.config.description).toContain("Update an existing task");
    });
  });
});
