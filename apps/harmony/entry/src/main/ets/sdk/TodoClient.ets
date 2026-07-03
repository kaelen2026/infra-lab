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
import { HarmonySession } from "./AuthClient";
import { AuthorizedTransport, RawResponse, TransportRequest } from "./AuthorizedTransport";

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
 * HarmonyOS {@link TodoClient}: rides the shared {@link AuthorizedTransport} — the
 * same Bearer header, and the same refresh-and-retry on a `401`, as the auth client —
 * so todos stay in lockstep with the session established at login. Non-2xx responses
 * throw {@link HttpTodoError}.
 *
 * Update uses **PUT**, not PATCH: NetworkKit's `http.RequestMethod` has no PATCH
 * member, so the API accepts PUT as an alias for the same partial-update semantics.
 */
export class HarmonyTodoClient implements TodoClient {
  private readonly transport: AuthorizedTransport;

  constructor(session: HarmonySession) {
    this.transport = session.transport;
  }

  private async request<T>(
    path: string,
    method: http.RequestMethod,
    body?: TodoRequestBody,
  ): Promise<T> {
    const serialized: string | undefined = body === undefined ? undefined : JSON.stringify(body);
    const req: TransportRequest = { path: path, method: method, body: serialized };
    const res: RawResponse = await this.transport.send(req);
    const text: string = res.text;
    const json: object = text.length > 0 ? (JSON.parse(text) as object) : (JSON.parse("{}") as object);
    if (res.status < 200 || res.status >= 300) {
      const errorBody: TodoErrorBody = json as TodoErrorBody;
      throw new HttpTodoError(res.status, errorBody.code ?? "INVALID_REQUEST");
    }
    return json as T;
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
