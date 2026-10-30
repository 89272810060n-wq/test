// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ВАШ КОНФИГ (скопируйте из Firebase)
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
                status: "pending", // Ожидает подтверждения
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

// --- ЛОГИКА ДЛЯ АДМИНА (admin.html) ---
// Проверка, находимся ли мы на странице админа (очень простой способ)
if (window.location.pathname.includes('admin.html')) {
    // Функции входа
    window.login = () => {
        const email = document.getElementById('adminEmail').value;
        const pass = document.getElementById('adminPass').value;
        signInWithEmailAndPassword(auth, email, pass)
            .then(() => {
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('adminPanel').style.display = 'block';
                loadAdminData();
            })
            .catch((error) => alert("Ошибка входа: " + error.message));
    };

    // Слушатель авторизации
    onAuthStateChanged(auth, (user) => {
        if (user && window.location.pathname.includes('admin.html')) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            loadAdminData();
        }
    });

    function loadAdminData() {
        const pendingList = document.getElementById('pendingList');
        const activeList = document.getElementById('activeList');

        // Слушаем ВСЕ записи
        onSnapshot(collection(db, "visits"), (snapshot) => {
            pendingList.innerHTML = '';
            activeList.innerHTML = '';

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const id = docSnap.id;
                const card = document.createElement('div');
                card.className = 'card ' + (data.status === 'pending' ? 'pending' : 'active');
                
                if (data.status === 'pending') {
                    card.innerHTML = `
                        <p><b>${data.childName}</b> (${data.parentPhone})</p>
                        <p>Тариф: ${data.tariffHours} ч.</p>
                        <button onclick="approveVisit('${id}')">Подтвердить (Посадить)</button>
                    `;
                    pendingList.appendChild(card);
                } else if (data.status === 'active') {
                    // Вычисляем время окончания
                    const start = data.checkInTime ? data.checkInTime.toDate() : new Date();
                    const end = new Date(start.getTime() + data.tariffHours * 60 * 60 * 1000);
                    const timeLeft = end - new Date();
                    const minutesLeft = Math.max(0, Math.floor(timeLeft / 60000));

                    card.innerHTML = `
                        <p><b>${data.childName}</b></p>
                        <p>Посадили: ${start.toLocaleTimeString()}</p>
                        <p>Забрать: ${end.toLocaleTimeString()}</p>
                        <p>Осталось: <b>${minutesLeft} мин.</b></p>
                        <button onclick="checkoutVisit('${id}')">Забрали ребенка (Раньше)</button>
                    `;
                    activeList.appendChild(card);
                }
            });
        });
    }

    // Глобальные функции для кнопок
    window.approveVisit = async (id) => {
        await updateDoc(doc(db, "visits", id), {
            status: "active",
            checkInTime: new Date() // Фиксируем время
        });
    };

    window.checkoutVisit = async (id) => {
        await updateDoc(doc(db, "visits", id), {
            status: "completed",
            checkOutTime: new Date()
        });
    };
}
