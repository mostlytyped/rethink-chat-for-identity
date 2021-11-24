import io from "socket.io-client";

const socket = io(process.env.VUE_APP_DATA_API_SOCKETIO_URL, {
    auth: {
        token: localStorage.getItem("token"),
    },
});

socket.on("connect", () => {
    console.log("connected. socket.id:", socket.id);
});

socket.on("connect_error", (err) => {
    console.error("err.message", err.message);
    if (err.message === "Unauthorized") {
        console.log("sign out");
        localStorage.removeItem("token");
        localStorage.removeItem("idToken");

        // a `beforeEach` global navigation guard in the router handles redirection
        location.reload();
    }
});

export default socket;
