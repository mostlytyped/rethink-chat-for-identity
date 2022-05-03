import { rid } from "../rethinkid";

import { MainView, RoomView, LoggedOutView } from "../views";

const routes = [
    { path: "/", name: "home", component: MainView },
    { path: "/:userId/room/:roomId", name: "room", component: RoomView },
    { path: "/logged-out", name: "logged-out", component: LoggedOutView, meta: { requiresAuth: false } },
    {
        path: "/callback",
        name: "callback",
        meta: { requiresAuth: false },
        beforeEnter(to, from, next) {
            try {
                rid.completeLogIn();
            } catch (e) {
                console.error("completeLogIn error:", e.message);
            }
        },
    },
];
const router = new VueRouter({
    mode: "history",
    routes,
});

router.beforeEach((to, from, next) => {
    // If route requires auth
    if (to.matched.some((record) => record.meta.requiresAuth !== false)) {
        if (!rid.isLoggedIn()) {
            // Redirect to the sign in view if no token found and route requires auth
            next({ name: "logged-out" });
            return;
        }
    }

    next();
});

export default router;
