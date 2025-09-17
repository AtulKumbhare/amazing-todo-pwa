import { useEffect, useState } from "react";
import localforage from "localforage";
import "./App.css";

const API_BASE = "http://localhost:4000/api";

// localForage helpers (only for pending operations)
async function lfGetPending() {
  return (await localforage.getItem("pending")) || [];
}
async function lfSetPending(list) {
  await localforage.setItem("pending", list);
}
function genClientId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}
async function lfPendingPush(entry) {
  const list = await lfGetPending();
  const withId = { ...entry, clientId: genClientId() };
  list.push(withId);
  await lfSetPending(list);
  return withId.clientId;
}
async function lfPendingRemove(clientId) {
  const list = await lfGetPending();
  const next = list.filter((p) => p.clientId !== clientId);
  await lfSetPending(next);
}

function App() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Load todos from cache first, then from server if online
    (async () => {
      let pendingList = await lfGetPending();
      pendingList = pendingList?.map(item => item?.payload);
        if ("caches" in window) {
        const cache = await caches.open("todo-cache-v1");
        const cached = await cache.match(`${API_BASE}/todos`);
        if (cached) {
          const data = await cached.json();
          setTodos([...pendingList, ...data]);
        }
      }

      if (navigator.onLine) {
        await syncWithServer();
        const res = await fetch(`${API_BASE}/todos`);
        if (res.ok) {
          const data = await res.json();
          setTodos(data);
          // Cache the latest data
          if ("caches" in window) {
            const cache = await caches.open("todo-cache-v1");
            await cache.put(`${API_BASE}/todos`, res.clone());
          }
        }
      }
    })();

    const onOnline = () => {
      setIsOnline(true);
      syncWithServer();
    };
    const onOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function syncWithServer() {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const pending = await lfGetPending();
      for (const change of pending) {
        const { op, payload } = change;
        if (op === "create") {
          const { title, completed, updatedAt } = payload;
          const res = await fetch(`${API_BASE}/todos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, completed, updatedAt }),
          });
          if (res.ok) {
            await lfPendingRemove(change.clientId);
          }
        } else if (op === "update") {
          const res = await fetch(`${API_BASE}/todos/${payload.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) await lfPendingRemove(change.clientId);
        } else if (op === "delete") {
          const res = await fetch(`${API_BASE}/todos/${payload.id}`, {
            method: "DELETE",
          });
          if (res.status === 204 || res.status === 404)
            await lfPendingRemove(change.clientId);
        }
      }
      // Refresh from server and update cache
      const res = await fetch(`${API_BASE}/todos`);
      if (res.ok) {
        const data = await res.json();
        setTodos(data);
        if ("caches" in window) {
          const cache = await caches.open("todo-cache-v1");
          await cache.put(`${API_BASE}/todos`, res.clone());
        }
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  }

  async function addTodo(e) {
    e.preventDefault();
    const title = input.trim();
    if (!title) return;
    const newTodo = {
      title,
      completed: false,
      updatedAt: new Date().toISOString(),
      localOnly: true,
    };
    setTodos([newTodo, ...todos]);
    setInput("");

    if (navigator.onLine) {
      try {
        const res = await fetch(`${API_BASE}/todos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newTodo.title,
            completed: newTodo.completed,
            updatedAt: newTodo.updatedAt,
          }),
        });
        if (!res.ok) throw new Error("Failed to create on server");
      } catch {
        await lfPendingPush({
          op: "create",
          payload: {
            title: newTodo.title,
            completed: newTodo.completed,
            updatedAt: newTodo.updatedAt,
          },
        });
      }
    } else {
      await lfPendingPush({
        op: "create",
        payload: {
          title: newTodo.title,
          completed: newTodo.completed,
          updatedAt: newTodo.updatedAt,
        },
      });
    }
  }

  async function toggleTodo(todo) {
    const updated = {
      ...todo,
      completed: !todo.completed,
      updatedAt: new Date().toISOString(),
    };
    setTodos(todos.map((t) => (t.id === todo.id ? updated : t)));

    if (navigator.onLine && !String(updated.id).startsWith("p_")) {
      try {
        const res = await fetch(`${API_BASE}/todos/${updated.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (!res.ok) throw new Error("Failed to update");
      } catch {
        await lfPendingPush({ op: "update", payload: updated });
      }
    } else {
      await lfPendingPush({ op: "update", payload: updated });
    }
  }

  async function deleteTodo(todo) {
    setTodos(todos.filter((t) => t.id !== todo.id));

    if (navigator.onLine && !String(todo.id).startsWith("p_")) {
      try {
        const res = await fetch(`${API_BASE}/todos/${todo.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");
      } catch {
        await lfPendingPush({ op: "delete", payload: { id: todo.id } });
      }
    } else {
      await lfPendingPush({ op: "delete", payload: { id: todo.id } });
    }
  }

  async function renameTodo(todo, title) {
    const updated = {
      ...todo,
      title: title.trim(),
      updatedAt: new Date().toISOString(),
    };
    setTodos(todos.map((t) => (t.id === todo.id ? updated : t)));

    if (navigator.onLine && !String(updated.id).startsWith("p_")) {
      try {
        const res = await fetch(`${API_BASE}/todos/${updated.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (!res.ok) throw new Error("Failed to rename");
      } catch {
        await lfPendingPush({ op: "update", payload: updated });
      }
    } else {
      await lfPendingPush({ op: "update", payload: updated });
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Todos</h1>
      <form onSubmit={addTodo} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="What needs to be done?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1, padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button type="submit" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #888", background: "#f3f3f3", color: "#000" }}>
          Add
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: isOnline ? "#2ecc71" : "#e74c3c", display: "inline-block" }} />
        <small>{isOnline ? "Online" : "Offline"}{isSyncing ? " · Syncing…" : ""}</small>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {todos.map((t) => (
          <li key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid #e5e5e5", borderRadius: 8 }}>
            <input type="checkbox" checked={!!t.completed} onChange={() => toggleTodo(t)} />
            <input
              value={t.title}
              onChange={(e) => renameTodo(t, e.target.value)}
              style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 6, textDecoration: t.completed ? "line-through" : "none" }}
            />
            <button onClick={() => deleteTodo(t)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", color: "#000" }}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      {todos.length === 0 && <p style={{ color: "#666", fontSize: 14 }}>No todos yet.</p>}
    </div>
  );
}

export default App;
