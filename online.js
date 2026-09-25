// Та битгий уурлаарай — V2.1 Online Room Foundation
(() => {
  'use strict';

  const firebaseConfig = {
    apiKey: 'AIzaSyDM-a1geS6_R7nEe7r55SCk7_ka7MXIfEA',
    authDomain: 'ta-bitgii-uurlaarai.firebaseapp.com',
    databaseURL: 'https://ta-bitgii-uurlaarai-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'ta-bitgii-uurlaarai',
    storageBucket: 'ta-bitgii-uurlaarai.firebasestorage.app',
    messagingSenderId: '41627584364',
    appId: '1:41627584364:web:f4dc28831f308c6f1f1549'
  };
  const ROOM_ROOT = 'tbuRooms';
  const SESSION_KEY = 'tbu-online-room-v1';
  const PENDING_INVITE_KEY = 'tbu-pending-room-v1';
  const colorInfo = {
    red: { label: 'Улаан', hex: '#bd3b32' },
    blue: { label: 'Хөх', hex: '#356a91' },
    green: { label: 'Ногоон', hex: '#32744a' },
    yellow: { label: 'Шар', hex: '#d8a72e' }
  };
  const colorOrder = ['red', 'blue', 'green', 'yellow'];

  const $ = selector => document.querySelector(selector);
  const overlay = $('#onlineOverlay');
  const entry = $('#onlineEntry');
  const lobby = $('#onlineLobby');
  const note = $('#onlineNote');
  const nameInput = $('#playerName');
  const codeInput = $('#onlineRoomCode');
  let auth = null;
  let database = null;
  let roomRef = null;
  let roomCode = '';
  let uid = '';
  let isHost = false;
  let roomListener = null;
  let currentRoom = null;
  let busy = false;

  function setNote(message, state = '') {
    note.textContent = message;
    note.dataset.state = state;
  }

  function cleanName() {
    const value = nameInput.value.trim().replace(/\s+/g, ' ').slice(0, 18);
    if (value) localStorage.setItem('tbu-player-name', value);
    return value;
  }

  function setBusy(value) {
    busy = value;
    ['#createOnlineRoom', '#joinOnlineRoom', '#showJoinRoom'].forEach(id => {
      const button = $(id);
      if (button) button.disabled = value;
    });
  }

  function saveSession() {
    if (!roomCode || !uid) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, uid, savedAt: Date.now() }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function connect() {
    if (!window.firebase) throw new Error('firebase-unavailable');
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    database = firebase.database();
    if (!auth.currentUser) await auth.signInAnonymously();
    uid = auth.currentUser.uid;
    return uid;
  }

  function makeCode() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return String(100000 + values[0] % 900000);
  }

  function showEntry() {
    entry.hidden = false;
    lobby.hidden = true;
  }

  function showLobby() {
    entry.hidden = true;
    lobby.hidden = false;
    $('#lobbyRoomCode').textContent = roomCode;
  }

  function openOnline() {
    document.querySelectorAll('.overlay.show').forEach(item => item.classList.remove('show'));
    overlay.classList.add('show');
    showEntry();
    setNote('');
    nameInput.value = localStorage.getItem('tbu-player-name') || '';
    const urlCode = new URLSearchParams(location.search).get('room');
    if (/^\d{6}$/.test(urlCode || '')) localStorage.setItem(PENDING_INVITE_KEY, urlCode);
    const invitedCode = /^\d{6}$/.test(urlCode || '') ? urlCode : localStorage.getItem(PENDING_INVITE_KEY);
    if (/^\d{6}$/.test(invitedCode || '')) {
      $('#joinFields').hidden = false;
      codeInput.value = invitedCode;
      setNote(`${invitedCode} өрөөний урилга нээгдлээ. Нэрээ бичээд нэгдээрэй.`, 'success');
    }
  }

  function invitationUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', roomCode);
    return url.href;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand('copy');
    helper.remove();
    if (!ok) throw new Error('copy-failed');
  }

  async function inviteFriend() {
    const data = {
      title: 'Та битгий уурлаарай!',
      text: `🎲 “Та битгий уурлаарай!” тоглоомын ${roomCode} өрөөнд нэгдээрэй!`,
      url: invitationUrl()
    };
    try {
      if (navigator.share) await navigator.share(data);
      else await copyText(data.url);
      setNote(navigator.share ? 'Урилгыг хуваалцлаа.' : 'Урилгын холбоос хуулагдлаа.', 'success');
    } catch (error) {
      if (error?.name !== 'AbortError') setNote('Урилгыг илгээж чадсангүй. Кодыг хуулж илгээнэ үү.', 'error');
    }
  }

  function playerEntries(room) {
    return Object.entries(room?.players || {}).filter(([, player]) => player && player.name);
  }

  function renderLobby(room) {
    currentRoom = room;
    const players = playerEntries(room);
    const occupied = new Map(players.map(([id, player]) => [player.color, [id, player]]));
    $('#seatList').innerHTML = colorOrder.map(color => {
      const info = colorInfo[color];
      const seat = occupied.get(color);
      if (!seat) {
        return `<div class="seat empty"><span class="seat-dot" style="background:${info.hex}"></span><span>${info.label}<br><small>Сул суудал</small></span><button data-color="${color}">Сонгох</button></div>`;
      }
      const [id, player] = seat;
      const host = id === room.hostUid ? '<span class="host-tag"> · Өрөө үүсгэгч</span>' : '';
      const ready = player.ready ? '✅ Бэлэн' : '⏳ Хүлээж байна';
      return `<div class="seat"><span class="seat-dot" style="background:${info.hex}"></span><span>${escapeHtml(player.name)}${host}<br><small>${ready}</small></span>${id === uid ? '<strong>Та</strong>' : ''}</div>`;
    }).join('');
    $('#seatList').querySelectorAll('[data-color]').forEach(button => {
      button.onclick = () => chooseColor(button.dataset.color);
    });
    const me = room.players?.[uid];
    $('#readyOnline').textContent = me?.ready ? '✅ Бэлэн болсон' : 'Бэлэн';
    $('#readyOnline').classList.toggle('ready-on', Boolean(me?.ready));
    const everyoneReady = players.length >= 2 && players.every(([, player]) => player.ready);
    $('#startOnline').hidden = !isHost;
    $('#startOnline').disabled = !isHost || !everyoneReady;
    if (room.status === 'started') {
      setNote('✅ Өрөө амжилттай бэлэн боллоо! Синхрон тоглолтыг V2.2-д холбоно.', 'success');
    } else if (players.length < 2) {
      setNote('Найзаа уриад хүлээнэ үү. Тоглоход хамгийн багадаа 2 хүн хэрэгтэй.');
    } else if (!everyoneReady) {
      setNote('Бүх тоглогч Бэлэн товчоо дарахыг хүлээж байна.');
    } else {
      setNote(isHost ? 'Бүгд бэлэн! Тоглоомыг эхлүүлж болно.' : 'Бүгд бэлэн. Өрөө үүсгэгч тоглоомыг эхлүүлнэ.', 'success');
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  }

  function listenToRoom() {
    if (roomListener && roomRef) roomRef.off('value', roomListener);
    roomListener = snapshot => {
      if (!snapshot.exists()) {
        setNote('Өрөө хаагдсан эсвэл олдсонгүй.', 'error');
        clearSession();
        showEntry();
        return;
      }
      showLobby();
      renderLobby(snapshot.val());
    };
    roomRef.on('value', roomListener, () => setNote('Өрөөний мэдээллийг уншиж чадсангүй.', 'error'));
  }

  async function createRoom() {
    const name = cleanName();
    if (!name) return setNote('Эхлээд нэрээ бичнэ үү.', 'error');
    if (!navigator.onLine) return setNote('Интернэт холболт алга.', 'error');
    setBusy(true);
    setNote('Өрөө үүсгэж байна…');
    try {
      await connect();
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = makeCode();
        const candidateRef = database.ref(`${ROOM_ROOT}/${candidate}`);
        const result = await candidateRef.transaction(current => {
          if (current !== null) return;
          return {
            hostUid: uid,
            status: 'waiting',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: { [uid]: { name, color: 'red', ready: false, joinedAt: firebase.database.ServerValue.TIMESTAMP } }
          };
        }, undefined, false);
        if (!result.committed) continue;
        roomCode = candidate;
        roomRef = candidateRef;
        isHost = true;
        saveSession();
        await roomRef.child(`players/${uid}/online`).onDisconnect().set(false);
        await roomRef.child(`players/${uid}/online`).set(true);
        listenToRoom();
        history.replaceState(null, '', invitationUrl());
        return;
      }
      throw new Error('code-collision');
    } catch (error) {
      console.error(error);
      setNote('Онлайн өрөө үүсгэж чадсангүй. Firebase тохиргоог шалгана уу.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    const name = cleanName();
    const candidate = codeInput.value.replace(/\D/g, '').slice(0, 6);
    codeInput.value = candidate;
    if (!name) return setNote('Эхлээд нэрээ бичнэ үү.', 'error');
    if (!/^\d{6}$/.test(candidate)) return setNote('6 оронтой өрөөний код оруулна уу.', 'error');
    if (!navigator.onLine) return setNote('Интернэт холболт алга.', 'error');
    setBusy(true);
    setNote('Өрөөнд нэгдэж байна…');
    try {
      await connect();
      const candidateRef = database.ref(`${ROOM_ROOT}/${candidate}`);
      // Prime the local cache before starting the transaction. On a new
      // browser/device, the transaction callback may otherwise receive an
      // initial null value and abort before the existing room is downloaded.
      const initialSnapshot = await candidateRef.once('value');
      const initialRoom = initialSnapshot.val();
      if (!initialRoom || initialRoom.status !== 'waiting') throw new Error('room-unavailable');
      const result = await candidateRef.transaction(room => {
        if (!room || room.status !== 'waiting') return;
        room.players ||= {};
        if (!room.players[uid] && Object.keys(room.players).length >= 4) return;
        const used = new Set(Object.entries(room.players).filter(([id]) => id !== uid).map(([, player]) => player.color));
        const color = room.players[uid]?.color || colorOrder.find(item => !used.has(item));
        if (!color) return;
        room.players[uid] = { name, color, ready: room.players[uid]?.ready || false, joinedAt: room.players[uid]?.joinedAt || firebase.database.ServerValue.TIMESTAMP, online: true };
        return room;
      }, undefined, false);
      if (!result.committed) throw new Error('room-unavailable');
      roomCode = candidate;
      roomRef = candidateRef;
      isHost = result.snapshot.val().hostUid === uid;
      saveSession();
      localStorage.removeItem(PENDING_INVITE_KEY);
      await roomRef.child(`players/${uid}/online`).onDisconnect().set(false);
      listenToRoom();
      history.replaceState(null, '', invitationUrl());
    } catch (error) {
      console.error(error);
      setNote('Өрөө олдсонгүй, дүүрсэн эсвэл тоглоом эхэлсэн байна.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function chooseColor(color) {
    if (!roomRef || !currentRoom || !colorInfo[color]) return;
    try {
      const result = await roomRef.child('players').transaction(players => {
        if (!players?.[uid]) return;
        if (Object.entries(players).some(([id, player]) => id !== uid && player.color === color)) return;
        players[uid].color = color;
        players[uid].ready = false;
        return players;
      }, undefined, false);
      if (!result.committed) setNote('Энэ өнгийг өөр тоглогч түрүүлж сонголоо.', 'error');
    } catch (_) {
      setNote('Өнгө сонгож чадсангүй.', 'error');
    }
  }

  async function toggleReady() {
    if (!roomRef || !currentRoom?.players?.[uid]) return;
    const next = !currentRoom.players[uid].ready;
    try {
      await roomRef.child(`players/${uid}/ready`).set(next);
    } catch (_) {
      setNote('Бэлэн төлөвийг шинэчилж чадсангүй.', 'error');
    }
  }

  async function startRoom() {
    if (!isHost || !roomRef || !currentRoom) return;
    const players = playerEntries(currentRoom);
    if (players.length < 2 || !players.every(([, player]) => player.ready)) return;
    try {
      await roomRef.update({ status: 'started', startedAt: firebase.database.ServerValue.TIMESTAMP });
    } catch (_) {
      setNote('Өрөөг эхлүүлж чадсангүй.', 'error');
    }
  }

  async function leaveRoom() {
    if (roomRef && uid) {
      try {
        if (isHost) await roomRef.remove();
        else await roomRef.child(`players/${uid}`).remove();
      } catch (_) {}
      if (roomListener) roomRef.off('value', roomListener);
    }
    roomRef = null;
    roomCode = '';
    currentRoom = null;
    isHost = false;
    clearSession();
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.href);
  }

  $('#onlineButton').onclick = openOnline;
  $('#onlineClose').onclick = async () => {
    if (roomRef && currentRoom?.status === 'waiting' && !confirm('Онлайн өрөөнөөс гарах уу?')) return;
    await leaveRoom();
    overlay.classList.remove('show');
  };
  $('#showJoinRoom').onclick = () => { $('#joinFields').hidden = false; codeInput.focus(); };
  $('#createOnlineRoom').onclick = createRoom;
  $('#joinOnlineRoom').onclick = joinRoom;
  $('#inviteFriend').onclick = inviteFriend;
  $('#copyRoomCode').onclick = async () => {
    try { await copyText(roomCode); setNote(`${roomCode} код хуулагдлаа.`, 'success'); }
    catch (_) { setNote('Кодыг хуулж чадсангүй.', 'error'); }
  };
  $('#readyOnline').onclick = toggleReady;
  $('#startOnline').onclick = startRoom;
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); });

  const launchCode = new URLSearchParams(location.search).get('room');
  if (/^\d{6}$/.test(launchCode || '')) localStorage.setItem(PENDING_INVITE_KEY, launchCode);
  if (/^\d{6}$/.test(launchCode || '') || /^\d{6}$/.test(localStorage.getItem(PENDING_INVITE_KEY) || '')) {
    setTimeout(openOnline, 0);
  }
})();
