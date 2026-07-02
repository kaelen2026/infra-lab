import { http } from "@kit.NetworkKit";
import {
  CreateTodoInput,
  TODO_ROUTES,
  TodoDTO,
  TodoErrorCode,
  TodoResponse,
  TodosResponse,
  todoPath,
  UpdateTodoInput,
} from "../common/todo";
import { AuthTokens } from "../common/contracts";
import { TokenStore } from "./AuthClient";

/**
 * Thrown when the todos API responds non-2xx. Mirrors {@link HttpAuthError}: callers
 * branch on a stable {@link TodoErrorCode}. The UI collapses these to fixed copy,
 * matching `apps/h5`'s `use-todos` (no per-code todo messaging).
 */
export class HttpTodoError extends Error {
  readonly code: TodoErrorCode;
  readonly status: number;

  constructor(status: number, code: TodoErrorCode) {
    super(`todo request failed: ${code} (${status})`);
    this.name = "HttpTodoError";
    this.code = code;
    this.status = status;
  }
}

/** Error body shape returned by the API on non-2xx. */
interface TodoErrorBody {
  code?: TodoErrorCode;
}

type TodoRequestBody = CreateTodoInput | UpdateTodoInput;

/** The shape every platform SDK implements (mirrors the shared TodoClient). */
export interface TodoClient {
  list(): Promise<TodoDTO[]>;
  create(input: CreateTodoInput): Promise<TodoDTO>;
  update(id: string, patch: UpdateTodoInput): Promise<TodoDTO>;
  toggle(id: string, completed: boolean): Promise<TodoDTO>;
  remove(id: string): Promise<void>;
}

/**
 * HarmonyOS {@link TodoClient}: shares the auth transport model — `@ohos.net.http`
 * with a Bearer header sourced from the same {@link TokenStore} the auth client uses,
 * so todos ride the very session established at login. Non-2xx responses throw
 * {@link HttpTodoError}.
 *
 * Update uses **PUT**, not PATCH: NetworkKit's `http.RequestMethod` has no PATCH
 * member, so the API accepts PUT as an alias for the same partial-update semantics.
 */
export class HarmonyTodoClient implements TodoClient {
  private readonly baseUrl: string;
  private readonly store: TokenStore;

  constructor(baseUrl: string, store: TokenStore) {
    this.baseUrl = baseUrl;
    this.store = store;
  }

  private async request<T>(
    path: string,
    method: http.RequestMethod,
    body?: TodoRequestBody,
  ): Promise<T> {
    const header: Record<string, string> = { "Content-Type": "application/json" };
    const tokens: AuthTokens | null = await this.store.load();
    if (tokens !== null) {
      header["Authorization"] = `${tokens.tokenType} ${tokens.accessToken}`;
    }

    const request: http.HttpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: method,
        header: header,
        expectDataType: http.HttpDataType.STRING,
        extraData: body === undefined ? undefined : JSON.stringify(body),
      };
      const response: http.HttpResponse = await request.request(`${this.baseUrl}${path}`, options);
      const status: number = response.responseCode;
      const text: string = (response.result as string) ?? "";
      const json: object = text.length > 0 ? (JSON.parse(text) as object) : (JSON.parse("{}") as object);
      if (status < 200 || status >= 300) {
        const errorBody: TodoErrorBody = json as TodoErrorBody;
        throw new HttpTodoError(status, errorBody.code ?? "INVALID_REQUEST");
      }
      return json as T;
    } finally {
      request.destroy();
    }
  }

  async list(): Promise<TodoDTO[]> {
    const res: TodosResponse = await this.request<TodosResponse>(
      TODO_ROUTES.list,
      http.RequestMethod.GET,
    );
    return res.todos;
  }

  async create(input: CreateTodoInput): Promise<TodoDTO> {
    const res: TodoResponse = await this.request<TodoResponse>(
      TODO_ROUTES.create,
      http.RequestMethod.POST,
      input,
    );
    return res.todo;
  }

  async update(id: string, patch: UpdateTodoInput): Promise<TodoDTO> {
    const res: TodoResponse = await this.request<TodoResponse>(
      todoPath(id),
      http.RequestMethod.PUT,
      patch,
    );
    return res.todo;
  }

  toggle(id: string, completed: boolean): Promise<TodoDTO> {
    const patch: UpdateTodoInput = { completed: completed };
    return this.update(id, patch);
  }

  async remove(id: string): Promise<void> {
    await this.request<object>(todoPath(id), http.RequestMethod.DELETE);
  }
}
