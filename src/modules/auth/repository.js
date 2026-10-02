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

module.exports = {
    createUser,
    findUserByEmail
}