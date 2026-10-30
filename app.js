// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMr6_gJxdtCEl_uYmsDN9LwXtq9rRoWRA",
  authDomain: "kids-room-app.firebaseapp.com",
  projectId: "kids-room-app",
  storageBucket: "kids-room-app.firebasestorage.app",
  messagingSenderId: "150998614419",
  appId: "1:150998614419:web:3e1c21633155871f666866"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const PRICE_PER_HOUR = 300; // <-- Ваша цена за час
const BASE_URL = "https://89272810060n-wq.github.io/test/";
// --- РОДИТЕЛЬ: форма заявки (index.html) ---
const form = document.getElementById('visitForm');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('childName').value;
        const phone = document.getElementById('parentPhone').value;
        const tariffHours = document.getElementById('tariff').value;

        try {
            await addDoc(collection(db, "visits"), {
                childName: name,
                parentPhone: phone,
                tariffHours: Number(tariffHours),
                status: "pending",
                checkInTime: null,
                checkOutTime: null,
                createdAt: serverTimestamp()
            });
            document.getElementById('status').innerText = "Заявка отправлена! Подойдите к администратору.";
            form.reset();
        } catch (error) {
            console.error("Ошибка: ", error);
            document.getElementById('status').innerText = "Ошибка отправки.";
        }
    });
}

// --- РОДИТЕЛЬ: страница статуса (status.html) ---
const timerElement = document.getElementById('timer');
if (timerElement) {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
    let currentData = null;
    let timerInterval = null;

    if (!visitId) {
        document.getElementById('mainCard').innerHTML = "<h2>Ошибка: Запись не найдена</h2>";
    } else {
        onSnapshot(doc(db, "visits", visitId), (docSnap) => {
            if (!docSnap.exists()) return;
            currentData = docSnap.data();
            
            document.getElementById('childName').innerText = currentData.childName;

            if (currentData.checkInTime) {
                const start = currentData.checkInTime.toDate();
                const end = new Date(start.getTime() + currentData.tariffHours * 60 * 60 * 1000);
                
                document.getElementById('startTime').innerText = start.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                document.getElementById('endTime').innerText = end.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                document.getElementById('price').innerText = currentData.tariffHours * PRICE_PER_HOUR;

                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const diff = end - new Date();
                    if (diff <= 0) {
                        timerElement.innerText = "00:00:00";
                        timerElement.style.color = "red";
                        clearInterval(timerInterval);
                    } else {
                        const h = Math.floor(diff / 3600000);
                        const m = Math.floor((diff % 3600000) / 60000);
                        const s = Math.floor((diff % 60000) / 1000);
                        timerElement.innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                    }
                }, 1000);
            } else {
                document.getElementById('mainCard').innerHTML = "<h2>Ожидайте подтверждения администратора...</h2>";
            }
        });
    }
}

window.extendTime = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
    if (visitId && currentData) {
        await updateDoc(doc(db, "visits", visitId), {
            tariffHours: currentData.tariffHours + 0.5
        });
        document.getElementById('msg').style.display = 'block';
        setTimeout(() => document.getElementById('msg').style.display = 'none', 3000);
    }
};

// --- АДМИН (admin.html) ---
if (window.location.pathname.includes('admin.html')) {
    window.login = () => {
        const email = document.getElementById('adminEmail').value;
        const pass = document.getElementById('adminPass').value;
        signInWithEmailAndPassword(auth, email, pass)
            .catch((error) => alert("Ошибка входа: " + error.message));
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            startListening();
        }
    });

    function startListening() {
        const pendingList = document.getElementById('pendingList');
        const activeList = document.getElementById('activeList');
        const pendingCount = document.getElementById('pendingCount');
        const activeCount = document.getElementById('activeCount');
        const debug = document.getElementById('debug');

        // Слушаем ВСЕ документы БЕЗ фильтров и сортировки — это гарантирует, что ничего не потеряется
        onSnapshot(collection(db, "visits"), (snapshot) => {
            pendingList.innerHTML = '';
            activeList.innerHTML = '';
            let pendingNum = 0;
            let activeNum = 0;
            let totalDocs = 0;

            snapshot.forEach((docSnap) => {
                totalDocs++;
                const data = docSnap.data();
                const id = docSnap.id;

                // Отладочный вывод, чтобы видеть, что реально приходит из базы
                console.log("Запись:", id, data.status, data.childName);

                if (data.status === 'pending') {
                    pendingNum++;
                    const card = document.createElement('div');
                    card.className = 'card pending';
                    card.innerHTML = `
                        <div class="info-block">
                            <p><b>${data.childName || 'Без имени'}</b> (${data.parentPhone || 'нет телефона'})</p>
                            <p>Тариф: ${data.tariffHours || 0} ч.</p>
                        </div>
                        <button onclick="approveVisit('${id}')">Подтвердить</button>
                    `;
                    pendingList.appendChild(card);
                } else if (data.status === 'active') {
                    activeNum++;
                    const start = data.checkInTime ? data.checkInTime.toDate() : new Date();
                    const end = new Date(start.getTime() + (data.tariffHours || 0) * 60 * 60 * 1000);
                    const minutesLeft = Math.max(0, Math.floor((end - new Date()) / 60000));
                    const totalPrice = (data.tariffHours || 0) * PRICE_PER_HOUR;

                    const card = document.createElement('div');
                    card.className = 'card active';
                    const parentLink = `${BASE_URL}status.html?id=${id}`;

                    card.innerHTML = `
                        <div class="info-block">
                            <p><b>${data.childName}</b></p>
                            <p>Осталось: <b>${minutesLeft} мин.</b> (К оплате: ${totalPrice} ₽)</p>
                            <button onclick="checkoutVisit('${id}')">Забрали ребенка</button>
                        </div>
                        <div class="qr-box" id="qr-${id}"></div>
                    `;
                    activeList.appendChild(card);

                    // Генерируем QR через qrcodejs (другая библиотека)
                    try {
                        const qrContainer = document.getElementById(`qr-${id}`);
                        if (qrContainer) {
                            qrContainer.innerHTML = ''; // очищаем на случай повторной отрисовки
                            new QRCode(qrContainer, {
                                text: parentLink,
                                width: 100,
                                height: 100,
                                colorDark : "#000000",
                                colorLight : "#ffffff",
                                correctLevel : QRCode.CorrectLevel.H
                            });
                        }
                    } catch (e) {
                        console.error("Ошибка генерации QR:", e);
                        document.getElementById(`qr-${id}`).innerText = "QR ошибка";
                    }
                }
            });

            pendingCount.innerText = pendingNum;
            activeCount.innerText = activeNum;
            debug.innerText = `Всего записей в базе: ${totalDocs}. Pending: ${pendingNum}, Active: ${activeNum}`;
        }, (error) => {
            console.error("Ошибка onSnapshot:", error);
            document.getElementById('debug').innerText = "Ошибка: " + error.message;
        });
    }

    window.approveVisit = async (id) => {
        await updateDoc(doc(db, "visits", id), {
            status: "active",
            checkInTime: new Date()
        });
    };

    window.checkoutVisit = async (id) => {
        await updateDoc(doc(db, "visits", id), {
            status: "completed",
            checkOutTime: new Date()
        });
    };
}
