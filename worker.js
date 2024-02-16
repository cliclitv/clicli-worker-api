addEventListener("fetch", event => {
    event.respondWith(fetchAndStream(event.request))
});

const kv = await Deno.openKv();

async function fetchAndStream(req) {
    const { pathname, searchParams } = new URL(req.url)

    let ret = {
        msg: 'hello clicli'
    }

    if (pathname === '/qiandao') {
        ret = await qianDao(searchParams.get('uid'), req)
    } else if (pathname.indexOf('vip') > -1) {
        ret = await vipOp(pathname, searchParams.get('uid'))
    } else if (pathname.indexOf('action') > -1) {
        ret = await actionOp(pathname, searchParams.get('uid'), searchParams.get('type'), searchParams.get('pid'))
    } else if (pathname.indexOf('danmu') > -1) {
        ret = await danmuOp(pathname, req, searchParams.get('pid'), searchParams.get('p'))
    } else if (pathname === '/delete') {
        // 预留删除接口
        const k = searchParams.get('k').split('.')
        await kv.delete(k)
        return new Response('删除成功')
    }

    return new Response(JSON.stringify(ret), {
        headers: {
            "content-type": 'application/json;charset=utf-8',
            "Access-Control-Allow-Origin": "*"
        }
    })
}

async function actionOp(pathname, uid, type, pid) {
    let ret = {}
    let some = false
    let prefix = ['action', pid, type]
    let k = ['action', pid, type, uid]

    console.log(pathname)

    if (pathname === '/action/replace') {
        let vv = { uid, type, pid }
        const v = kv.get(k).value
        if (v) {
            kv.delete(k)
        } else {
            kv.set(k, vv)
        }
        ret = {
            code: 0,
            k,
            count: await actionOp('/action/count', uid, type, pid)
        }
    } else if (pathname === '/action/count') {
        const iter = kv.list({ prefix })
        console.log(k)
        const list = []
        for await (const res of iter) {
            if (res.key.includes(uid)) {
                some = true
            }
            let data = {
                id: res.key.join('.'),
                ...res.value
            }
            list.push(data)
        }

        ret = {
            code: 0,
            count: list.length,
            some,
            list
        }

    }
    return ret
}

async function danmuOp(pathname, req, pid, p) {
    let ret = {}
    if (pathname === '/danmu/add') {
        const body = await req.json()
        if (body.time) {
            // 预留更新接口
            const kk = ['danmu', body.pid.toString(), (body.p || 0).toString(), body.time]
            await kv.set(kk, body)
        } else {
            // 增加弹幕
            const now = new Date().getTime()
            const kk = ['danmu', body.pid.toString(), (body.p || 0).toString(), now.toString()]
            body.time = now
            await kv.set(kk, body)
            await peaOp(body.uid.toString(), '/pea/add')
        }
        ret = {
            code: 0,
        }

    } else if (pathname === '/danmu/list') {
        const prefix = ['danmu', pid, p]
        const iter = kv.list({ prefix })
        const list = []
        for await (const res of iter) {
            let data = {
                id: res.key.join('.'),
                ...res.value
            }
            list.push(data)
        }
        ret = {
            code: 0,
            list,
        }

    }

    return ret
}

async function vipOp(pathname, uid) {
    const k = ['vip', uid]
    let expireTime = await kv.get(k)
    let ret = {}
    if (pathname === '/vip/add') {
        expireTime.value = expireTime.value + 3600 * 1000
        await kv.set(k, expireTime.value)



        ret = {
            code: 0,
            expire: expireTime.value
        }

    } else {
        if (!expireTime.value) {
            expireTime.value = Date.now()
            await kv.set(k, expireTime.value)
        }
        ret = { code: 0, expire: expireTime.value }
    }

    return ret
}

async function peaOp(uid, pathname) {
    const k = ['pea', uid]
    let currentPea = await kv.get(k)
    let ret = {}
    if (pathname === '/pea/add') {
        if (currentPea.value) {
            currentPea.value = currentPea.value + 1
            await kv.set(k, currentPea.value)

        } else {
            currentPea.value = 1
            await kv.set(k, currentPea.value)
        }

        ret = {
            code: 0,
            pea: currentPea.value
        }

    } else if (pathname === '/pea/cut') {
        if (currentPea.value) {
            currentPea.value = currentPea.value - 1
            await kv.set(k, currentPea.value)
            ret = {
                code: 0,
                pea: currentPea.value
            }
        } else {
            currentPea.value = 0
            await kv.set(k, 0)
            ret = {
                code: 1,
                pea: currentPea.value
            }
        }
    } else {
        ret = { code: 0, pea: currentPea.value }
    }

    return ret
}


async function qianDao(uid, req) {
    const now = new Date().getTime()
    const nexttime = new Date(new Date().toLocaleDateString()).getTime() + 24 * 60 * 60 * 1000 - 1
    const k = ['qiandao', uid]
    let ret = {}
    const qiandaoTime = await kv.get(k)
    if (req.method === "GET") { // 检查状态
        // 没超时，处于签到状态
        if (now < qiandaoTime.value) {
            ret = {
                code: 1,
                msg: "已签到"
            }
        } else {
            ret = {
                code: 0,
                msg: "签到"
            }
        }
    } else {
        // 如果没超时，什么也不做
        if (now < qiandaoTime.value) {
            ret = {
                code: 1,
                msg: "重复签到"
            }
        } else { // 超时了
            await kv.set(k, nexttime)
            await peaOp(uid, '/pea/add')
            ret = {
                code: 1,
                msg: "签到成功"
            }
        }
    }
    return ret
}
