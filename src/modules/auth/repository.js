const prisma = require('../../config/database');

const createUser = async (userData) => {
    return await prisma.user.create({
        data: userData
    });
};

const findUserByEmail = async (email) => {
    return await prisma.user.findUnique({
        where: { email },
        include: { role : true }
    });
};
// --- TAMBAHAN BARU ---
const updateLastLogin = async (userId) => {
    return await prisma.user.update({
        where: { id: userId },
        data: { lastLogin: new Date() }
    });
};

module.exports = {
    createUser,
    findUserByEmail,
    updateLastLogin
}