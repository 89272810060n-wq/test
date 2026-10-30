// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ВАШ КОНФИГ (оставьте свой, который уже работает)
const firebaseConfig = {
  apiKey: "AIzaSyAMr6_gJxdtCEl_uYmsDN9LwXtq9rRoWRA",
  authDomain: "kids-room-app.firebaseapp.com",
  databaseURL: "https://kids-room-app-default-rtdb.firebaseio.com",
  projectId: "kids-room-app",
  storageBucket: "kids-room-app.firebasestorage.app",
  messagingSenderId: "150998614419",
  appId: "1:150998614419:web:3e1c21633155871f666866"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Константы для расчета
const PRICE_PER_HOUR = 300; // Укажите вашу цену за час
const BASE_URL = window.location.origin + window.location.pathname.replace('app.js', ''); // Автоматически определяет адрес сайта

// --- ЛОГИКА ДЛЯ РОДИТЕЛЯ (index.html) ---
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

// --- ЛОГИКА ДЛЯ СТРАНИЦЫ СТАТУСА (status.html) ---
const timerElement = document.getElementById('timer');
if (timerElement) {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');

    if (!visitId) {
        document.getElementById('mainCard').innerHTML = "<h2>Ошибка: Запись не найдена</h2>";
    } else {
        let currentData = null;
        let timerInterval = null;

        // Функция обновления интерфейса
        const updateUI = (data) => {
            currentData = data;
            document.getElementById('childName').innerText = data.childName;
            
            if (data.checkInTime) {
                const start = data.checkInTime.toDate();
                const end = new Date(start.getTime() + data.tariffHours * 60 * 60 * 1000);
                
                document.getElementById('startTime').innerText = start.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                document.getElementById('endTime').innerText = end.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                
                // Расчет стоимости
                const totalPrice = data.tariffHours * PRICE_PER_HOUR;
                document.getElementById('price').innerText = totalPrice;

                // Запуск таймера
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const now = new Date();
                    const diff = end - now;
                    
                    if (diff <= 0) {
                        timerElement.innerText = "00:00";
                        timerElement.style.color = "red";
                        clearInterval(timerInterval);
                    } else {
                        const hours = Math.floor(diff / (1000 * 60 * 60));
                        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                        timerElement.innerText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }
                }, 1000);
            } else {
                document.getElementById('mainCard').innerHTML = "<h2>Ожидайте подтверждения администратора...</h2>";
            }
        };

        // Слушаем изменения в базе для этого конкретного ребенка
        onSnapshot(doc(db, "visits", visitId), (docSnap) => {
            if (docSnap.exists()) {
                updateUI(docSnap.data());
            }
        });
    }
}

// Глобальная функция для продления со страницы родителя
window.extendTime = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
    if (visitId && currentData) {
        await updateDoc(doc(db, "visits", visitId), {
            tariffHours: currentData.tariffHours + 0.5 // Добавляем 30 минут
        });
        document.getElementById('msg').style.display = 'block';
        setTimeout(() => document.getElementById('msg').style.display = 'none', 3000);
    }
};

// --- ЛОГИКА ДЛЯ АДМИНА (admin.html) ---
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
            loadAdminData();
        }
    });

    function loadAdminData() {
        const pendingList = document.getElementById('pendingList');
        const activeList = document.getElementById('activeList');

        onSnapshot(collection(db, "visits"), (snapshot) => {
            pendingList.innerHTML = '';
            activeList.innerHTML = '';

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const id = docSnap.id;
                
                if (data.status === 'pending') {
                    const card = document.createElement('div');
                    card.className = 'card pending';
                    card.innerHTML = `
                        <div class="info-block">
                            <p><b>${data.childName}</b> (${data.parentPhone})</p>
                            <p>Тариф: ${data.tariffHours} ч.</p>
                        </div>
                        <button onclick="approveVisit('${id}')">Подтвердить (Посадить)</button>
                    `;
                    pendingList.appendChild(card);
                } else if (data.status === 'active') {
                    const start = data.checkInTime ? data.checkInTime.toDate() : new Date();
                    const end = new Date(start.getTime() + data.tariffHours * 60 * 60 * 1000);
                    const minutesLeft = Math.max(0, Math.floor((end - new Date()) / 60000));
                    const totalPrice = data.tariffHours * PRICE_PER_HOUR;

                    const card = document.createElement('div');
                    card.className = 'card active';
                    
                    // Создаем уникальную ссылку для родителя
                    const parentLink = `${BASE_URL}status.html?id=${id}`;

                    card.innerHTML = `
                        <div class="info-block">
                            <p><b>${data.childName}</b></p>
                            <p>Осталось: <b>${minutesLeft} мин.</b> (К оплате: ${totalPrice} ₽)</p>
                            <button onclick="checkoutVisit('${id}')">Забрали ребенка</button>
                        </div>
                        <div class="qr-box">
                            <canvas id="qr-${id}"></canvas>
                            <p style="font-size:10px; margin:0;">QR для родителя</p>
                        </div>
                    `;
                    activeList.appendChild(card);

                    // Генерируем QR-код на только что созданном canvas
                    const canvas = document.getElementById(`qr-${id}`);
                    QRCode.toCanvas(canvas, parentLink, function (error) {
                        if (error) console.error(error);
                    });
                }
            });
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
