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
// Исправленный BASE_URL
const BASE_URL = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

let currentData = null; // для страницы родителя

// --- РОДИТЕЛЬ: форма заявки ---
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
                baseHours: Number(tariffHours), // базовый тариф
                extraHours: 0,                  // доплата (в часах)
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

// --- РОДИТЕЛЬ: страница статуса ---
const timerElement = document.getElementById('timer');
if (timerElement) {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
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
                const totalHours = (currentData.baseHours || 0) + (currentData.extraHours || 0);
                const end = new Date(start.getTime() + totalHours * 60 * 60 * 1000);
                
                document.getElementById('startTime').innerText = start.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                document.getElementById('endTime').innerText = end.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                document.getElementById('price').innerText = totalHours * PRICE_PER_HOUR;
                document.getElementById('tariffText').innerText = `Базовый: ${currentData.baseHours} ч. + Доплата: ${currentData.extraHours} ч.`;

                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const diff = end - new Date();
                    if (diff <= 0) {
                        timerElement.innerText = "00:00:00";
                        timerElement.style.color = "red";
                        document.getElementById('timeLeftText').innerText = "Время вышло!";
                        clearInterval(timerInterval);
                    } else {
                        const h = Math.floor(diff / 3600000);
                        const m = Math.floor((diff % 3600000) / 60000);
                        const s = Math.floor((diff % 60000) / 1000);
                        timerElement.innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                        document.getElementById('timeLeftText').innerText = `${h} ч. ${m} мин.`;
                    }
                }, 1000);
            } else {
                document.getElementById('mainCard').innerHTML = "<h2>Ожидайте подтверждения администратора...</h2>";
            }
        });
    }
}

// Продление на странице родителя (добавляем 0.5 часа к extraHours)
window.extendTime = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
    if (visitId && currentData) {
        const newExtra = (currentData.extraHours || 0) + 0.5;
        await updateDoc(doc(db, "visits", visitId), {
            extraHours: newExtra
        });
        document.getElementById('msg').innerText = "Продление оформлено!";
        document.getElementById('msg').style.display = 'block';
        setTimeout(() => document.getElementById('msg').style.display = 'none', 3000);
    }
};

// Доплата (фиксированная сумма, например, за опоздание — оформляем как +0.5 часа доплаты)
window.addFine = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
    if (visitId && currentData) {
        const newExtra = (currentData.extraHours || 0) + 0.5;
        await updateDoc(doc(db, "visits", visitId), {
            extraHours: newExtra
        });
        document.getElementById('msg').innerText = "Доплата добавлена!";
        document.getElementById('msg').style.display = 'block';
        setTimeout(() => document.getElementById('msg').style.display = 'none', 3000);
    }
};

// --- АДМИН ---
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
        const pendingContainer = document.getElementById('pendingContainer');
        const activeContainer = document.getElementById('activeContainer');
        const debug = document.getElementById('debug');

        onSnapshot(collection(db, "visits"), (snapshot) => {
            let pendingHTML = `<table><tr><th>Имя</th><th>Телефон</th><th>Тариф</th><th>Действие</th></tr>`;
            let activeHTML = `<table><tr><th>Имя</th><th>Прибыл</th><th>Уход</th><th>Тариф</th><th>К оплате</th><th>QR</th><th>Действие</th></tr>`;
            
            let pendingCount = 0;
            let activeCount = 0;

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const id = docSnap.id;

                if (data.status === 'pending') {
                    pendingCount++;
                    pendingHTML += `<tr>
                        <td>${data.childName}</td>
                        <td>${data.parentPhone}</td>
                        <td>${data.baseHours} ч.</td>
                        <td><button class="btn btn-approve" onclick="approveVisit('${id}')">Посадить</button></td>
                    </tr>`;
                } else if (data.status === 'active') {
                    activeCount++;
                    const start = data.checkInTime ? data.checkInTime.toDate() : new Date();
                    const totalHours = (data.baseHours || 0) + (data.extraHours || 0);
                    const end = new Date(start.getTime() + totalHours * 60 * 60 * 1000);
                    const startStr = start.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                    const endStr = end.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                    const totalPrice = totalHours * PRICE_PER_HOUR;
                    const tariffStr = `${data.baseHours} ч. + ${data.extraHours || 0} ч.`;

                    activeHTML += `<tr>
                        <td>${data.childName}</td>
                        <td>${startStr}</td>
                        <td>${endStr}</td>
                        <td>${tariffStr}</td>
                        <td>${totalPrice} ₽</td>
                        <td><button class="btn btn-qr" onclick="showQR('${id}', '${data.childName}')">QR</button></td>
                        <td>
                            <button class="btn btn-extend" onclick="adminExtend('${id}', ${data.extraHours || 0})">+30 мин</button>
                            <button class="btn btn-checkout" onclick="checkoutVisit('${id}')">Забрали</button>
                        </td>
                    </tr>`;
                }
            });

            pendingHTML += `</table>`;
            activeHTML += `</table>`;

            pendingContainer.innerHTML = pendingHTML;
            activeContainer.innerHTML = activeHTML;
            debug.innerText = `Всего: Pending: ${pendingCount}, Active: ${activeCount}`;
        }, (error) => {
            console.error("Ошибка onSnapshot:", error);
        });
    }

    // Показать QR в модальном окне
    window.showQR = (id, name) => {
        document.getElementById('modalChildName').innerText = name;
        const qrContainer = document.getElementById('qrModalCanvas');
        qrContainer.innerHTML = ''; // очистить
        const parentLink = `${BASE_URL}status.html?id=${id}`;
        new QRCode(qrContainer, {
            text: parentLink,
            width: 400,
            height: 400,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        document.getElementById('qrModal').style.display = 'flex';
    };

    window.closeModal = () => {
        document.getElementById('qrModal').style.display = 'none';
    };

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

    // Продление из админки
    window.adminExtend = async (id, currentExtra) => {
        await updateDoc(doc(db, "visits", id), {
            extraHours: currentExtra + 0.5
        });
    };
}
