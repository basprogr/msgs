const SUPABASE_URL = "https://qjwmhtnfowkmwoflwhzy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-vCSXzmIWSM9kn7VHWRhjg_g2B5IYXF"; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

const notifySound = new Audio("notify.mp3");
 
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("r");
const currentUser = urlParams.get("u");

// Definisi dua user yang diizinkan dalam percakapan
const USER1 = 'bas';
const USER2 = 'dalq';

let selectedReplyId = null;
let messagesCache = {}; 
let oldestMessageTime = null; 
let isLoadingMore = false;    
 
const app = document.getElementById("app");
const errorScreen = document.getElementById("error-screen");
const errorMessage = document.getElementById("error-message");
const chatBox = document.getElementById("chat-box");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const roomDisplay = document.getElementById("room-display");
const userDisplay = document.getElementById("user-display");
const userLogsContainer = document.getElementById("user-logs-container");
const replyPreview = document.getElementById("reply-preview");
const replyUser = document.getElementById("reply-user");
const replyText = document.getElementById("reply-text");
 
// Validasi apakah parameter u sesuai dengan USER1 atau USER2
if (!currentUser || (currentUser !== USER1 && currentUser !== USER2)) {
  document.addEventListener("DOMContentLoaded", () => {
    showError("Akses ditolak: User tidak terdaftar dalam percakapan ini.");
  });
}

// Konfigurasi profil lawan bicara secara dinamis berdasarkan deklarasi di atas
let targetName = 'User';
let profileImgUrl = 'default.jpg';

if (currentUser === USER1) {
    targetName = USER2;
    profileImgUrl = 'user2.jpg'; 
} else if (currentUser === USER2) {
    targetName = USER1;
    profileImgUrl = 'user1.jpg'; 
}

document.addEventListener("DOMContentLoaded", () => {
  if (roomId) {
    roomDisplay.textContent = `${roomId}`;
    userDisplay.textContent = targetName;
    document.getElementById('profile-img').src = profileImgUrl;
  }
});
 
async function init() {
  if (!roomId || !currentUser) {
    showError("Invalid URL");
    return;
  }

  if (currentUser !== USER1 && currentUser !== USER2) {
    showError("Akses ditolak: User tidak terdaftar dalam percakapan ini.");
    return;
  }

  const { data: rooms, error } = await supabaseClient
    .from("rooms")
    .select("id")
    .eq("id", roomId);

  if (error || !rooms || rooms.length === 0) {
    showError("Room chat tidak ditemukan atau belum terdaftar di database.");
    return;
  }

  chatBox.innerHTML = `
    <div class="chat-loader">
      <svg class="rotating-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M544.1 256L552 256C565.3 256 576 245.3 576 232L576 88C576 78.3 570.2 69.5 561.2 65.8C552.2 62.1 541.9 64.2 535 71L483.3 122.8C439 86.1 382 64 320 64C191 64 84.3 159.4 66.6 283.5C64.1 301 76.2 317.2 93.7 319.7C111.2 322.2 127.4 310 129.9 292.6C143.2 199.5 223.3 128 320 128C364.4 128 405.2 143 437.7 168.3L391 215C384.1 221.9 382.1 232.2 385.8 241.2C389.5 250.2 398.3 256 408 256L544.1 256zM573.5 356.5C576 339 563.8 322.8 546.4 320.3C529 317.8 512.7 330 510.2 347.4C496.9 440.4 416.8 511.9 320.1 511.9C275.7 511.9 234.9 496.9 202.4 471.6L249 425C255.9 418.1 257.9 407.8 254.2 398.8C250.5 389.8 241.7 384 232 384L88 384C74.7 384 64 394.7 64 408L64 552C64 561.7 69.8 570.5 78.8 574.2C87.8 577.9 98.1 575.8 105 569L156.8 517.2C201 553.9 258 576 320 576C449 576 555.7 480.6 573.4 356.5z"/></svg>
    </div>
  `;

  await logUserAccess();
  await fetchMessages();
  await fetchUserLogs();
  subscribeRealtime();
 
  chatBox.addEventListener("scroll", () => {
    if (chatBox.scrollTop === 0) {
      loadMoreMessages();
    }
  });
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorScreen.style.display = "block";
  app.style.display = "none";
}

async function logUserAccess() {
  const { error } = await supabaseClient
    .from("user_logs")
    .upsert(
      {
        room_id: roomId,
        user_name: currentUser,
        last_seen: new Date().toISOString()
      },
      { onConflict: "room_id, user_name" }
    );

  if (error) {
    console.error("Gagal mencatat log user:", error);
  }
}

async function fetchUserLogs() {
  const { data, error } = await supabaseClient
    .from("user_logs")
    .select("user_name, last_seen")
    .eq("room_id", roomId);

  if (error) {
    console.error("Gagal mengambil log user:", error);
    return;
  }

  userLogsContainer.innerHTML = "";

  const targetLog = data.find(log => log.user_name === targetName);

  if (targetLog) {
    const timeStr = formatLastSeen(targetLog.last_seen);
    // Masukkan SVG jam dan teks status secara bersamaan
    userLogsContainer.innerHTML = `
      <svg style="width: 12px; height: 12px; fill: #667781; display: inline-block; vertical-align: middle;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z"/></svg>
      <span>${timeStr}</span>
    `;
  } else {
    // Tanpa SVG jika status masih menunggu
    userLogsContainer.innerHTML = `<span>Menunggu...</span>`;
  }
}

function formatLastSeen(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / 60000);

  if (diffInMinutes < 1) return "Baru saja";
  if (diffInMinutes < 60) return `${diffInMinutes} mnt lalu`;
  
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function fetchMessages() {
  const { data, error } = await supabaseClient
    .from("messages")
    .select(`
      id,
      room_id,
      user_name,
      content,
      created_at,
      reply_to_id,
      parent:reply_to_id ( user_name, content )
    `)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Gagal mengambil pesan:", error);
    return;
  }

  data.reverse();

  chatBox.innerHTML = "";
  messagesCache = {}; 
  
  if (data.length > 0) {
    oldestMessageTime = data[0].created_at; 
  }

  data.forEach((msg) => {
    messagesCache[msg.id] = msg; 
    renderMessage(msg, "bottom");
  });
  
  scrollToBottom();
}

async function loadMoreMessages() {
  if (isLoadingMore || !oldestMessageTime) return;
  isLoadingMore = true;

  const previousHeight = chatBox.scrollHeight;

  const { data, error } = await supabaseClient
    .from("messages")
    .select(`
      id,
      room_id,
      user_name,
      content,
      created_at,
      reply_to_id,
      parent:reply_to_id ( user_name, content )
    `)
    .eq("room_id", roomId)
    .lt("created_at", oldestMessageTime)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Gagal memuat pesan lama:", error);
    isLoadingMore = false;
    return;
  }

  if (data && data.length > 0) {
    data.reverse();
    oldestMessageTime = data[0].created_at; 

    data.forEach((msg) => {
      messagesCache[msg.id] = msg;
      renderMessage(msg, "top"); 
    });

    chatBox.scrollTop = chatBox.scrollHeight - previousHeight;
  }

  isLoadingMore = false;
}

function renderMessage(msg, position = "bottom") {
  messagesCache[msg.id] = msg; 
  const isSentByMe = msg.user_name === currentUser;
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isSentByMe ? "sent" : "received"}`;
  msgEl.id = `msg-${msg.id}`;

  const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  let replyHTML = "";
  if (msg.parent) {
    replyHTML = `
      <div class="reply-context">
        <span class="reply-user">${escapeHtml(msg.parent.user_name)}</span>
        <div>${escapeHtml(msg.parent.content)}</div>
      </div>
    `;
  }

  let deleteBtn = "";
  if (isSentByMe) {
    deleteBtn = `<button class="action-btn delete" onclick="deleteMessage(${msg.id})">Hapus</button>`;
  }

  msgEl.innerHTML = `
    <span class="message-user">${escapeHtml(msg.user_name)}</span>
    ${replyHTML}
    <div>${escapeHtml(msg.content)}</div>
    <div class="message-footer">
      <span class="message-time">${timeStr}</span>
      <button class="action-btn" onclick="triggerReply(${msg.id})">Balas</button>
      ${deleteBtn}
    </div>
  `;

  if (position === "top") {
    chatBox.insertBefore(msgEl, chatBox.firstChild);
  } else {
    chatBox.appendChild(msgEl);
  }
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const payload = {
    room_id: roomId,
    user_name: currentUser,
    content: text,
    reply_to_id: selectedReplyId,
  };

  messageInput.value = "";
  cancelReply();

  const { error } = await supabaseClient.from("messages").insert([payload]);

  if (error) {
    console.error("Gagal mengirim pesan:", error);
  } else {
    await logUserAccess();
  }
});

async function deleteMessage(msgId) {
  const { error } = await supabaseClient
    .from("messages")
    .delete()
    .eq("id", msgId)
    .eq("user_name", currentUser);

  if (error) {
    console.error("Gagal menghapus pesan:", error);
  }
}

function triggerReply(id) {
  const msg = messagesCache[id];
  if (!msg) return;
  
  selectedReplyId = id;
  replyUser.textContent = msg.user_name;
  replyText.textContent = msg.content;
  replyPreview.classList.add("active");
  messageInput.focus();
}

function cancelReply() {
  selectedReplyId = null;
  replyPreview.classList.remove("active");
}

function subscribeRealtime() {
  supabaseClient
    .channel(`room_realtime_${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${roomId}`,
      },
      async (payload) => {
        if (payload.new.user_name !== currentUser) {
          notifySound.currentTime = 0;
          notifySound.play().catch(err => console.log("Gagal memutar audio:", err));
        }

        if (payload.new.reply_to_id) {
          const { data: fullMsg } = await supabaseClient
            .from("messages")
            .select(`
              id,
              room_id,
              user_name,
              content,
              created_at,
              reply_to_id,
              parent:reply_to_id ( user_name, content )
            `)
            .eq("id", payload.new.id)
            .single();

          if (fullMsg) {
            renderMessage(fullMsg, "bottom");
          } else {
            renderMessage(payload.new, "bottom");
          }
        } else {
          renderMessage(payload.new, "bottom");
        }

        scrollToBottom();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "messages",
      },
      (payload) => {
        const deletedEl = document.getElementById(`msg-${payload.old.id}`);
        if (deletedEl) deletedEl.remove();
        delete messagesCache[payload.old.id];
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_logs",
        filter: `room_id=eq.${roomId}`,
      },
      async () => {
        await fetchUserLogs();
      }
    )
    .subscribe();
}

function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();